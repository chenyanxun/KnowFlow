import { Card, Col, Row, Statistic, Table, Typography } from 'antd'
import { formatTime } from '../access'
import { useStore } from '../store'

export default function DashboardPage() {
  const { summary } = useStore()
  const recent = summary?.recent ?? []

  return (
    <div className="page">
      <Typography.Title level={4} style={{ margin: 0 }}>仪表盘</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="用户数" value={summary?.accountCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="启用用户" value={summary?.enabledAccountCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="文档数" value={summary?.documentCount ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="今日上传" value={summary?.todayUploadCount ?? 0} /></Card>
        </Col>
      </Row>
      <Card title="最近上传">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={recent}
          columns={[
            { title: '文件名', dataIndex: 'originalName' },
            { title: '上传人', dataIndex: 'uploadedByName' },
            { title: '时间', dataIndex: 'uploadedAt', render: (value: string) => formatTime(value) },
          ]}
        />
      </Card>
    </div>
  )
}
