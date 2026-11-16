import { App, Button, Input, Popconfirm, Space, Table, Tag, Typography, Upload } from 'antd'
import { useEffect, useState } from 'react'
import { formatSize, formatTime } from '../access'
import { useStore } from '../store'
import type { DocumentRecord } from '../types'

export default function DocumentPage() {
  const store = useStore()
  const { message } = App.useApp()
  const [keyword, setKeyword] = useState('')
  const data = store.db.documents.filter((item) => item.originalName.toLowerCase().includes(keyword.trim().toLowerCase()))
  const indexing = store.db.documents.some((item) => item.vectorStatus === 'pending' || item.vectorStatus === 'processing')

  useEffect(() => {
    if (!indexing) return
    const timer = window.setInterval(() => {
      void store.reloadDocuments()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [indexing, store])

  return (
    <div className="page">
      <div className="page-bar">
        <Typography.Title level={4} style={{ margin: 0 }}>文档管理</Typography.Title>
        {store.can('document:upload') ? (
          <Upload
            showUploadList={false}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg"
            beforeUpload={(file) => {
              void store.addDocument(file).then((result) => {
                if (!result.ok) message.error(result.message)
                else message.success('上传成功')
              })
              return false
            }}
          >
            <Button type="primary">上传文档</Button>
          </Upload>
        ) : null}
      </div>
      <Input.Search allowClear autoComplete="off" placeholder="搜索文件名" onSearch={setKeyword} onChange={(event) => setKeyword(event.target.value)} style={{ maxWidth: 280 }} />
      <Table
        rowKey="id"
        dataSource={data}
        columns={[
          { title: '文件名', dataIndex: 'originalName' },
          { title: '大小', dataIndex: 'size', render: (size: number) => formatSize(size) },
          { title: '上传人', dataIndex: 'uploadedByName' },
          { title: '上传时间', dataIndex: 'uploadedAt', render: (value: string) => formatTime(value) },
          {
            title: '入库',
            render: (_, record: DocumentRecord) => <VectorStatus record={record} />,
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                {store.can('document:download') ? (
                  <Button type="link" onClick={() => void store.downloadDocument(record.id, record.originalName).catch((error: Error) => message.error(error.message))}>下载</Button>
                ) : null}
                {store.can('document:delete') ? (
                  <Popconfirm title="删除这个文档？" onConfirm={async () => {
                    const result = await store.removeDocument(record.id)
                    if (!result.ok) message.error(result.message)
                  }}>
                    <Button type="link" danger>删除</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}

const statusLabel = {
  pending: '处理中',
  processing: '处理中',
  done: '已入库',
  skipped: '未入库',
  failed: '失败',
} as const

function VectorStatus({ record }: { record: DocumentRecord }) {
  const label = record.vectorStatus === 'done' ? `已入库 ${record.chunkCount} 段` : statusLabel[record.vectorStatus]
  const color = record.vectorStatus === 'done' ? 'success' : record.vectorStatus === 'failed' ? 'error' : record.vectorStatus === 'skipped' ? 'default' : 'processing'
  return (
    <span>
      <Tag color={color}>{label}</Tag>
      {record.vectorMessage ? <Typography.Text type="secondary">{record.vectorMessage}</Typography.Text> : null}
    </span>
  )
}
