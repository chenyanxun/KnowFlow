import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { hashSync } from 'bcryptjs'
import { mkdirSync, writeFileSync } from 'fs'
import { createPool, Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { join } from 'path'

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(36) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    is_system TINYINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    portal VARCHAR(16) NOT NULL DEFAULT 'admin',
    created_at DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS account_roles (
    account_id VARCHAR(36) NOT NULL,
    role_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (account_id, role_id)
  )`,
  `CREATE TABLE IF NOT EXISTS menus (
    id VARCHAR(36) PRIMARY KEY,
    parent_id VARCHAR(36) NULL,
    name VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL,
    path VARCHAR(128) NULL,
    icon VARCHAR(32) NULL,
    permission VARCHAR(64) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    visible TINYINT NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS role_menus (
    role_id VARCHAR(36) NOT NULL,
    menu_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (role_id, menu_id)
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(36) PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    uploaded_by VARCHAR(36) NOT NULL,
    uploaded_at DATETIME NOT NULL,
    vector_status VARCHAR(16) NOT NULL DEFAULT 'skipped',
    vector_message VARCHAR(255) NULL,
    chunk_count INT NOT NULL DEFAULT 0
  )`,
]

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  pool!: Pool
  private resolveReady: (() => void) | null = null
  private rejectReady: ((error: unknown) => void) | null = null
  readonly ready = new Promise<void>((resolve, reject) => {
    this.resolveReady = resolve
    this.rejectReady = reject
  })

  constructor() {
    void this.ready.catch(() => undefined)
  }

  async onModuleInit() {
    try {
      const database = process.env.DB_NAME ?? 'knowflow'
      const admin = createPool({
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? 'root',
        waitForConnections: true,
        connectionLimit: 2,
        multipleStatements: false,
      })
      await this.wait(admin)
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
      await admin.end()

      this.pool = createPool({
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? 'root',
        database,
        waitForConnections: true,
        connectionLimit: 10,
        timezone: '+08:00',
      })
      for (const statement of STATEMENTS) await this.pool.query(statement)
      await this.ensureDocumentColumns(database)
      await this.ensureAccountPortal(database)
      await this.seed()
      await this.ensureEmployeeMenus()
      this.resolveReady?.()
    } catch (error) {
      this.rejectReady?.(error)
      throw error
    }
  }

  async onModuleDestroy() {
    await this.pool?.end()
  }

  async query<T extends RowDataPacket>(sql: string, params: unknown[] = []) {
    const [rows] = await this.pool.query<T[]>(sql, params)
    return rows
  }

  async transaction<T>(work: (conn: PoolConnection) => Promise<T>) {
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      const result = await work(conn)
      await conn.commit()
      return result
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  private async ensureDocumentColumns(database: string) {
    const existing = await this.query<RowDataPacket & { COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'documents'`,
      [database],
    )
    const names = new Set(existing.map((row) => row.COLUMN_NAME))
    const columns: Array<[string, string]> = [
      ['vector_status', "VARCHAR(16) NOT NULL DEFAULT 'skipped'"],
      ['vector_message', 'VARCHAR(255) NULL'],
      ['chunk_count', 'INT NOT NULL DEFAULT 0'],
    ]
    for (const [name, definition] of columns) {
      if (!names.has(name)) await this.pool.query(`ALTER TABLE documents ADD COLUMN \`${name}\` ${definition}`)
    }
  }

  private async ensureAccountPortal(database: string) {
    const existing = await this.query<RowDataPacket & { COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'portal'`,
      [database],
    )
    if (!existing[0]) {
      await this.pool.query("ALTER TABLE accounts ADD COLUMN portal VARCHAR(16) NOT NULL DEFAULT 'admin'")
    }
  }

  private async ensureEmployeeMenus() {
    const menus: Array<[string, string | null, string, string, string | null, string | null, string | null, number]> = [
      ['menu-employees', 'menu-system', '员工账号', 'page', '/system/employees', 'idcard', null, 4],
      ['btn-employee-create', 'menu-employees', '新建员工', 'button', null, null, 'employee:create', 1],
      ['btn-employee-update', 'menu-employees', '编辑员工', 'button', null, null, 'employee:update', 2],
      ['btn-employee-disable', 'menu-employees', '启用停用', 'button', null, null, 'employee:disable', 3],
      ['btn-employee-reset', 'menu-employees', '重置密码', 'button', null, null, 'employee:reset-password', 4],
    ]
    for (const menu of menus) {
      const rows = await this.query<RowDataPacket & { id: string }>('SELECT id FROM menus WHERE id = ?', [menu[0]])
      if (!rows[0]) {
        await this.pool.query(
          `INSERT INTO menus (id, parent_id, name, type, path, icon, permission, sort_order, visible)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          menu,
        )
      }
      const links = await this.query<RowDataPacket & { role_id: string }>(
        'SELECT role_id FROM role_menus WHERE role_id = ? AND menu_id = ?',
        ['role-super', menu[0]],
      )
      if (!links[0]) {
        await this.pool.query('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', ['role-super', menu[0]])
      }
    }
  }

  private async wait(pool: Pool) {
    let last: unknown
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        await pool.query('SELECT 1')
        return
      } catch (error) {
        last = error
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    throw last
  }

  private async seed() {
    const existing = await this.query<RowDataPacket & { count: number }>('SELECT COUNT(*) AS count FROM accounts')
    if (Number(existing[0]?.count ?? 0) > 0) return

    const passwordHash = hashSync('Admin123', 10)
    const menus: Array<[string, string | null, string, string, string | null, string | null, string | null, number]> = [
      ['menu-dashboard', null, '仪表盘', 'page', '/dashboard', 'dashboard', null, 1],
      ['menu-system', null, '系统管理', 'directory', null, 'setting', null, 2],
      ['menu-users', 'menu-system', '用户管理', 'page', '/system/users', 'user', null, 1],
      ['btn-user-create', 'menu-users', '新建用户', 'button', null, null, 'user:create', 1],
      ['btn-user-update', 'menu-users', '编辑用户', 'button', null, null, 'user:update', 2],
      ['btn-user-disable', 'menu-users', '启用停用', 'button', null, null, 'user:disable', 3],
      ['btn-user-reset', 'menu-users', '重置密码', 'button', null, null, 'user:reset-password', 4],
      ['menu-roles', 'menu-system', '角色管理', 'page', '/system/roles', 'team', null, 2],
      ['btn-role-create', 'menu-roles', '新建角色', 'button', null, null, 'role:create', 1],
      ['btn-role-update', 'menu-roles', '编辑角色', 'button', null, null, 'role:update', 2],
      ['btn-role-delete', 'menu-roles', '删除角色', 'button', null, null, 'role:delete', 3],
      ['btn-role-assign', 'menu-roles', '分配菜单', 'button', null, null, 'role:assign', 4],
      ['menu-employees', 'menu-system', '员工账号', 'page', '/system/employees', 'idcard', null, 4],
      ['btn-employee-create', 'menu-employees', '新建员工', 'button', null, null, 'employee:create', 1],
      ['btn-employee-update', 'menu-employees', '编辑员工', 'button', null, null, 'employee:update', 2],
      ['btn-employee-disable', 'menu-employees', '启用停用', 'button', null, null, 'employee:disable', 3],
      ['btn-employee-reset', 'menu-employees', '重置密码', 'button', null, null, 'employee:reset-password', 4],
      ['menu-menus', 'menu-system', '菜单管理', 'page', '/system/menus', 'menu', null, 3],
      ['btn-menu-create', 'menu-menus', '新建菜单', 'button', null, null, 'menu:create', 1],
      ['btn-menu-update', 'menu-menus', '编辑菜单', 'button', null, null, 'menu:update', 2],
      ['btn-menu-delete', 'menu-menus', '删除菜单', 'button', null, null, 'menu:delete', 3],
      ['menu-documents', null, '文档管理', 'page', '/documents', 'file', null, 3],
      ['btn-doc-upload', 'menu-documents', '上传文档', 'button', null, null, 'document:upload', 1],
      ['btn-doc-download', 'menu-documents', '下载文档', 'button', null, null, 'document:download', 2],
      ['btn-doc-delete', 'menu-documents', '删除文档', 'button', null, null, 'document:delete', 3],
    ]
    for (const menu of menus) {
      await this.pool.query(
        `INSERT INTO menus (id, parent_id, name, type, path, icon, permission, sort_order, visible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        menu,
      )
    }

    await this.pool.query(`INSERT INTO roles (id, code, name, is_system) VALUES (?, ?, ?, 1)`, ['role-super', 'super_admin', '超级管理员'])
    await this.pool.query(`INSERT INTO roles (id, code, name, is_system) VALUES (?, ?, ?, 0)`, ['role-doc', 'doc_admin', '文档管理员'])
    await this.pool.query(`INSERT INTO roles (id, code, name, is_system) VALUES (?, ?, ?, 0)`, ['role-member', 'member', '普通成员'])

    for (const menu of menus) {
      await this.pool.query('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', ['role-super', menu[0]])
    }
    for (const menuId of ['menu-dashboard', 'btn-doc-upload', 'btn-doc-download', 'btn-doc-delete']) {
      await this.pool.query('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', ['role-doc', menuId])
    }
    for (const menuId of ['menu-dashboard', 'btn-doc-download']) {
      await this.pool.query('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', ['role-member', menuId])
    }

    const accounts: Array<[string, string, string, string, string]> = [
      ['account-admin', 'admin', '系统管理员', 'enabled', daysAgo(30, 9)],
      ['account-liwei', 'liwei', '李伟', 'enabled', daysAgo(12, 11)],
      ['account-wangfang', 'wangfang', '王芳', 'enabled', daysAgo(6, 14)],
      ['account-zhaomin', 'zhaomin', '赵敏', 'disabled', daysAgo(3, 16)],
    ]
    for (const account of accounts) {
      await this.pool.query(
        `INSERT INTO accounts (id, username, password_hash, name, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [account[0], account[1], passwordHash, account[2], account[3], account[4]],
      )
    }
    await this.pool.query('INSERT INTO account_roles (account_id, role_id) VALUES (?, ?)', ['account-admin', 'role-super'])
    await this.pool.query('INSERT INTO account_roles (account_id, role_id) VALUES (?, ?)', ['account-liwei', 'role-doc'])
    await this.pool.query('INSERT INTO account_roles (account_id, role_id) VALUES (?, ?)', ['account-wangfang', 'role-member'])
    await this.pool.query('INSERT INTO account_roles (account_id, role_id) VALUES (?, ?)', ['account-zhaomin', 'role-member'])

    const uploadDir = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads')
    mkdirSync(uploadDir, { recursive: true })
    const samples: Array<[string, string, string, string]> = [
      ['doc-handbook', '员工手册.pdf', 'account-admin', daysAgo(0, 9)],
      ['doc-expense', '报销制度.docx', 'account-liwei', daysAgo(2, 15)],
      ['doc-intro', '产品简介.md', 'account-wangfang', daysAgo(5, 10)],
    ]
    for (const sample of samples) {
      const storedName = `${sample[0]}.txt`
      const body = `KnowFlow 演示文件：${sample[1]}\n`
      writeFileSync(join(uploadDir, storedName), body)
      await this.pool.query(
        `INSERT INTO documents (id, original_name, stored_name, size_bytes, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [sample[0], sample[1], storedName, Buffer.byteLength(body), sample[2], sample[3]],
      )
    }
  }
}

function daysAgo(days: number, hour: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 20, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
