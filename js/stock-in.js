/**
 * 入库管理模块 - 处理入库记录的查看和管理
 */

/**
 * 初始化入库管理模块
 */
function initStockInModule() {
  // 绑定状态筛选
  const filterSelect = document.getElementById('filter-stockin-status');
  if (filterSelect) {
    filterSelect.addEventListener('change', loadStockInRecords);
  }

  // 加载入库记录
  loadStockInRecords();
}

/**
 * 加载入库记录列表
 */
function loadStockInRecords() {
  let records = [];
  const data = localStorage.getItem('stockInRecords');
  if (data) {
    records = JSON.parse(data);
  }

  // 按状态筛选
  const filterStatus = document.getElementById('filter-stockin-status')?.value || '';
  if (filterStatus) {
    records = records.filter(r => r.status === filterStatus);
  }

  // 按日期倒序排列
  records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const tbody = document.getElementById('stockin-tbody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无入库记录</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(record => `
    <tr>
      <td>${record.code}</td>
      <td>${record.purchase_order_code}</td>
      <td>${record.stockin_date}</td>
      <td>${record.items.length} 种 / ${record.total_quantity} 件</td>
      <td>${record.batch_code}</td>
      <td><span class="status-badge success">已完成</span></td>
      <td>
        <button class="btn btn-sm" onclick="viewStockInDetail('${record.code}')">查看详情</button>
      </td>
    </tr>
  `).join('');
}

/**
 * 查看入库详情
 */
function viewStockInDetail(recordCode) {
  let records = [];
  const data = localStorage.getItem('stockInRecords');
  if (data) {
    records = JSON.parse(data);
  }

  const record = records.find(r => r.code === recordCode);
  if (!record) {
    alert('未找到该入库记录');
    return;
  }

  let detail = `入库单号：${record.code}\n`;
  detail += `关联采购单：${record.purchase_order_code}\n`;
  detail += `入库日期：${record.stockin_date}\n`;
  detail += `批次号：${record.batch_code}\n`;
  detail += `确认人：${record.confirmed_by}\n`;
  detail += `确认时间：${new Date(record.confirmed_at).toLocaleString()}\n`;
  detail += `总数量：${record.total_quantity} 件\n`;
  detail += `总金额：¥${record.total_amount.toFixed(2)}\n\n`;
  
  if (record.remark) {
    detail += `备注：${record.remark}\n\n`;
  }

  detail += `入库明细：\n`;
  record.items.forEach((item, index) => {
    detail += `${index + 1}. ${item.name}`;
    if (item.brand) detail += ` (${item.brand})`;
    if (item.model) detail += ` [${item.model}]`;
    detail += `\n`;
    detail += `   采购数量：${item.quantity} ${item.unit}\n`;
    detail += `   实收数量：${item.actual_quantity} ${item.unit}\n`;
    detail += `   单价：¥${item.price.toFixed(2)}\n`;
    detail += `   金额：¥${(item.actual_quantity * item.price).toFixed(2)}\n\n`;
  });

  alert(detail);
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initStockInModule,
    loadStockInRecords
  };
}
