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
  let records = _appCache.stockInRecords || [];

  // 同时加载待入库的采购单（status === 'pending_stockin'）
  let pendingOrders = [];
  try {
    let allPOs = _appCache.purchaseOrders || [];
    pendingOrders = allPOs.filter(function(o) { return o.status === 'pending_stockin'; }).map(function(o) {
        return {
          _isPending: true,
          code: o.code,
          purchase_order_code: o.code,
          stockin_date: o.purchase_date || o.created_at || '',
          items: o.items || [],
          total_quantity: (o.items || []).reduce(function(sum, item) { return sum + (item.quantity || 0); }, 0),
          batch_code: '-',
          status: 'pending',
          created_at: o.created_at || '',
          orderId: o.id,
          purchaser: o.purchaser || ''
        };
      });
    } catch(e) { /* 静默 */ }

  // 合并：待入库在前，已完成在后
  var merged = pendingOrders.concat(records);

  // 同时加载待入库的采购单（status === 'pending_stockin'）
  const poData = localStorage.getItem('purchaseOrders');
  let pendingOrders = [];
  if (poData) {
    try {
      var allPOs = JSON.parse(poData);
      pendingOrders = allPOs.filter(function(o) { return o.status === 'pending_stockin'; }).map(function(o) {
        return {
          _isPending: true,
          code: o.code,
          purchase_order_code: o.code,
          stockin_date: o.purchase_date || o.created_at || '',
          items: o.items || [],
          total_quantity: (o.items || []).reduce(function(sum, item) { return sum + (item.quantity || 0); }, 0),
          batch_code: '-',
          status: 'pending',
          created_at: o.created_at || '',
          orderId: o.id,
          purchaser: o.purchaser || ''
        };
      });
    } catch(e) { /* 静默 */ }
  }

  // 合并：待入库在前，已完成在后
  var merged = pendingOrders.concat(records);

  // 按状态筛选
  const filterStatus = document.getElementById('filter-stockin-status')?.value || '';
  if (filterStatus) {
    merged = merged.filter(function(r) { return r.status === filterStatus; });
  }

  // 按日期倒序排列
  merged.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });

  const tbody = document.getElementById('stockin-tbody');
  if (!tbody) return;

  if (merged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无入库记录</td></tr>';
    return;
  }

  tbody.innerHTML = merged.map(function(record) {
    var code = record._isPending ? record.code : record.code;
    var poCode = record.purchase_order_code || '-';
    var date = record.stockin_date || '-';
    var qty = (record.items || []).length + ' 种';
    if (record.total_quantity) qty += ' / ' + record.total_quantity + ' 件';
    var batch = record.batch_code || '-';

    if (record._isPending) {
      // 待入库行
      var statusHtml = '<span class="status-badge warning">待入库</span>';
      var actionHtml = '<button class="btn btn-sm" onclick="confirmStockIn(' + record.orderId + ')" style="background:var(--success);border-color:var(--success);color:#fff;">入库</button>';
      return '<tr>' +
        '<td>' + code + '</td>' +
        '<td>' + poCode + '</td>' +
        '<td>' + date + '</td>' +
        '<td>' + qty + '</td>' +
        '<td>' + batch + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + actionHtml + '</td>' +
        '</tr>';
    } else {
      // 已完成入库行
      var statusHtml = '<span class="status-badge success">已完成</span>';
      var actionHtml = '<button class="btn btn-sm" onclick="viewStockInDetail(\'' + code + '\')">查看详情</button>';
      return '<tr>' +
        '<td>' + code + '</td>' +
        '<td>' + poCode + '</td>' +
        '<td>' + date + '</td>' +
        '<td>' + qty + '</td>' +
        '<td>' + batch + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + actionHtml + '</td>' +
        '</tr>';
    }
  }).join('');
}

/**
 * 查看入库详情
 */
function viewStockInDetail(recordCode) {
  let records = _appCache.stockInRecords || [];

  const record = records.find(r => r.code === recordCode);
  if (!record) {
    showToast('未找到该入库记录', 'error');
    return;
  }

  const body = document.getElementById('stockin-detail-body');
  if (!body) { showToast('弹窗容器未找到', 'error'); return; }

  // 构建详情 HTML
  let html = `
    <div class="detail-info-grid">
      <div class="detail-info-item">
        <span class="detail-info-label">入库单号</span>
        <span class="detail-info-value" style="font-family:monospace;">${record.code}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">关联采购单</span>
        <span class="detail-info-value" style="font-family:monospace;">${record.purchase_order_code || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">入库日期</span>
        <span class="detail-info-value">${record.stockin_date || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">批次号</span>
        <span class="detail-info-value" style="font-family:monospace;">${record.batch_code || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">确认人</span>
        <span class="detail-info-value">${record.confirmed_by || '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">确认时间</span>
        <span class="detail-info-value">${record.confirmed_at ? new Date(record.confirmed_at).toLocaleString() : '-'}</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">总数量</span>
        <span class="detail-info-value" style="color:var(--success);font-size:18px;">${record.total_quantity || 0} 件</span>
      </div>
      <div class="detail-info-item">
        <span class="detail-info-label">总金额</span>
        <span class="detail-info-value" style="color:var(--accent);font-size:18px;">¥${(record.total_amount || 0).toFixed(2)}</span>
      </div>
    </div>`;

  if (record.remark) {
    html += `<div style="margin-bottom:16px;font-size:13px;color:var(--text-secondary);">
      <strong>备注：</strong>${record.remark}
    </div>`;
  }

  // 入库明细表格
  html += `<div class="detail-section-title">入库明细</div>
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>物品名称</th>
            <th>品牌</th>
            <th>型号</th>
            <th>采购数量</th>
            <th>实收数量</th>
            <th>单位</th>
            <th>单价</th>
            <th>金额</th>
          </tr>
        </thead>
        <tbody>`;

  (record.items || []).forEach((item, idx) => {
    const amount = (item.actual_quantity || 0) * (item.price || 0);
    const diff = (item.actual_quantity || 0) - (item.quantity || 0);
    const diffClass = diff < 0 ? 'stock-low' : (diff > 0 ? 'stock-ok' : '');
    html += `<tr>
      <td>${idx + 1}</td>
      <td style="font-weight:600;">${item.name || '-'}</td>
      <td>${item.brand || '-'}</td>
      <td>${item.model || '-'}</td>
      <td>${item.quantity || 0}</td>
      <td style="font-weight:600;">${item.actual_quantity || 0}${diff !== 0 ? ` <span class="${diffClass}" style="font-size:11px;">(${diff > 0 ? '+' : ''}${diff})</span>` : ''}</td>
      <td>${item.unit || '-'}</td>
      <td>¥${(item.price || 0).toFixed(2)}</td>
      <td style="font-weight:600;">¥${amount.toFixed(2)}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';

  body.innerHTML = html;
  openModal('modal-stockin-detail');
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initStockInModule,
    loadStockInRecords
  };
}
