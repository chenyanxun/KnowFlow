import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RowDataPacket } from 'mysql2/promise'
import { AccessService, AuthUser, fail, mapMenu, MenuItem } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'

interface MenuBody {
  parentId?: string | null
  name?: string
  type?: MenuItem['type']
  path?: string
  icon?: string
  permission?: string
  sort?: number
  visible?: boolean
}

@Controller('menus')
@UseGuards(AuthGuard)
export class MenusController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.access.assertPage(user, ['/system/menus', '/system/roles'])
    const rows = await this.db.query<Parameters<typeof mapMenu>[0]>('SELECT * FROM menus ORDER BY sort_order ASC, name ASC')
    return rows.map(mapMenu)
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: MenuBody) {
    this.access.assertPermission(user, 'menu:create')
    const input = await this.clean(body)
    const id = randomUUID()
    await this.insert(id, input)
    return { id }
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: MenuBody) {
    this.access.assertPermission(user, 'menu:update')
    const rows = await this.db.query<RowDataPacket & { id: string }>('SELECT id FROM menus WHERE id = ?', [id])
    if (!rows[0]) fail('菜单不存在')
    const input = await this.clean(body, id)
    await this.db.query(
      `UPDATE menus SET parent_id = ?, name = ?, type = ?, path = ?, icon = ?, permission = ?, sort_order = ?, visible = ? WHERE id = ?`,
      [input.parentId, input.name, input.type, input.path, input.icon, input.permission, input.sort, input.visible, id],
    )
    return { id }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.access.assertPermission(user, 'menu:delete')
    const children = await this.db.query<RowDataPacket & { count: number }>('SELECT COUNT(*) AS count FROM menus WHERE parent_id = ?', [id])
    if (Number(children[0]?.count ?? 0) > 0) fail('请先删除子菜单')
    const result = await this.db.query<RowDataPacket & { id: string }>('SELECT id FROM menus WHERE id = ?', [id])
    if (!result[0]) return { id }
    await this.db.transaction(async (conn) => {
      await conn.query('DELETE FROM role_menus WHERE menu_id = ?', [id])
      await conn.query('DELETE FROM menus WHERE id = ?', [id])
    })
    return { id }
  }

  private async insert(id: string, input: CleanMenu) {
    await this.db.query(
      `INSERT INTO menus (id, parent_id, name, type, path, icon, permission, sort_order, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.parentId, input.name, input.type, input.path, input.icon, input.permission, input.sort, input.visible],
    )
  }

  private async clean(body: MenuBody, selfId?: string) {
    const name = body.name?.trim() ?? ''
    const type = body.type
    if (!name) fail('请填写菜单名称')
    if (type !== 'directory' && type !== 'page' && type !== 'button') fail('请填写菜单名称')
    if (type === 'page' && !body.path?.trim()) fail('页面需要填写路径')
    if (type === 'button' && !body.permission?.trim()) fail('按钮需要填写权限码')
    const parentId = body.parentId || null
    if (type === 'button' && !parentId) fail('按钮必须挂在一个页面下')
    if (parentId) await this.assertParent(parentId, type, selfId)
    return {
      parentId,
      name,
      type,
      path: type === 'page' ? body.path!.trim() : null,
      icon: type === 'button' ? null : body.icon || null,
      permission: type === 'button' ? body.permission!.trim() : null,
      sort: Number.isFinite(body.sort) ? Number(body.sort) : 1,
      visible: body.visible === false ? 0 : 1,
    }
  }

  private async assertParent(parentId: string, menuType: MenuItem['type'], selfId?: string) {
    let currentId: string | null = parentId
    let depth = 0
    while (currentId) {
      if (selfId && currentId === selfId) fail('不能选择自己作为上级')
      const rows: MenuParentRow[] = await this.db.query<MenuParentRow>('SELECT id, parent_id, type FROM menus WHERE id = ?', [currentId])
      const current: MenuParentRow | undefined = rows[0]
      if (!current) fail('上级菜单不存在')
      if (depth === 0) {
        if (menuType === 'button' && current.type !== 'page') fail('按钮只能挂在页面下')
        if (menuType !== 'button' && current.type === 'button') fail('不能挂到按钮下面')
      }
      currentId = current.parent_id
      depth += 1
      if (depth > 20) fail('不能选择自己作为上级')
    }
  }
}

interface MenuParentRow extends RowDataPacket {
  id: string
  parent_id: string | null
  type: MenuItem['type']
}

interface CleanMenu {
  parentId: string | null
  name: string
  type: MenuItem['type']
  path: string | null
  icon: string | null
  permission: string | null
  sort: number
  visible: number
}
