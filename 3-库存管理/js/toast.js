/**
 * Toast / Confirm / Prompt 组件
 * 替代浏览器原生 alert() / confirm() / prompt()
 */

/* ========== Toast 通知 ========== */
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 3000;

  // 确保容器存在
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const iconMap = {
    success: '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
    error:   '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
    warning: '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
    info:    '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML =
    '<span class="toast-icon">' + (iconMap[type] || iconMap.info) + '</span>' +
    '<span class="toast-message">' + message + '</span>' +
    '<button class="toast-close" aria-label="关闭">&times;</button>';

  container.appendChild(toast);

  // 触发入场动画
  requestAnimationFrame(function() {
    toast.classList.add('show');
  });

  // 关闭按钮
  toast.querySelector('.toast-close').addEventListener('click', function() {
    _dismissToast(toast);
  });

  // 自动关闭
  var timer = setTimeout(function() {
    _dismissToast(toast);
  }, duration);

  toast._timer = timer;
}

function _dismissToast(toast) {
  if (toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._timer);
  toast.classList.remove('show');
  toast.classList.add('hide');
  setTimeout(function() { toast.remove(); }, 300);
}

/* ========== Button Loading 按钮加载状态 ========== */

/**
 * 设置按钮为加载状态（显示 spinner + 禁用）
 * @param {HTMLElement|string} btn 按钮元素或 ID
 * @param {string} loadingText 加载中显示的文本（默认"保存中..."）
 */
function showButtonLoading(btn, loadingText) {
  if (typeof btn === 'string') btn = document.getElementById(btn);
  if (!btn) return;
  // 保存原始状态以便恢复
  btn._origDisabled = btn.disabled;
  btn._origHTML = btn.innerHTML;
  btn._origClass = btn.className;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="spinner"></span>' + (loadingText || '保存中...');
}

/**
 * 恢复按钮到原始状态
 * @param {HTMLElement|string} btn 按钮元素或 ID
 */
function hideButtonLoading(btn) {
  if (typeof btn === 'string') btn = document.getElementById(btn);
  if (!btn) return;
  btn.disabled = btn._origDisabled || false;
  btn.classList.remove('btn-loading');
  if (btn._origHTML) btn.innerHTML = btn._origHTML;
}

/* ========== Confirm 确认弹窗 ========== */
function showConfirm(message, onConfirm, onCancel) {
  // 移除已有的 confirm 弹窗
  var old = document.getElementById('custom-confirm-overlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'custom-confirm-overlay';
  overlay.className = 'modal-overlay';

  overlay.innerHTML =
    '<div class="confirm-dialog">' +
      '<div class="confirm-icon">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">' +
          '<circle cx="12" cy="12" r="10"/>' +
          '<line x1="12" y1="8" x2="12" y2="12"/>' +
          '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
        '</svg>' +
      '</div>' +
      '<div class="confirm-message">' + message.replace(/\n/g, '<br>') + '</div>' +
      '<div class="confirm-actions">' +
        '<button class="btn" id="confirm-cancel-btn">取消</button>' +
        '<button class="btn btn-danger" id="confirm-ok-btn">确定</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(function() { overlay.classList.add('show'); });

  var okBtn = document.getElementById('confirm-ok-btn');
  var cancelBtn = document.getElementById('confirm-cancel-btn');

  okBtn.addEventListener('click', function() {
    overlay.classList.remove('show');
    setTimeout(function() { overlay.remove(); }, 200);
    if (typeof onConfirm === 'function') onConfirm();
  });

  cancelBtn.addEventListener('click', function() {
    overlay.classList.remove('show');
    setTimeout(function() { overlay.remove(); }, 200);
    if (typeof onCancel === 'function') onCancel();
  });

  // ESC 关闭
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.stopPropagation(); cancelBtn.click(); }
  });
  okBtn.focus();
}

/* ========== Prompt 输入弹窗 ========== */
function showPrompt(message, defaultValue, onConfirm) {
  if (typeof defaultValue === 'function') {
    onConfirm = defaultValue;
    defaultValue = '';
  }

  var old = document.getElementById('custom-prompt-overlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'custom-prompt-overlay';
  overlay.className = 'modal-overlay';

  overlay.innerHTML =
    '<div class="confirm-dialog prompt-dialog">' +
      '<div class="confirm-message">' + message.replace(/\n/g, '<br>') + '</div>' +
      '<input type="text" class="prompt-input" id="prompt-input-field" value="' + (defaultValue || '').replace(/"/g, '&quot;') + '" />' +
      '<div class="confirm-actions">' +
        '<button class="btn" id="prompt-cancel-btn">取消</button>' +
        '<button class="btn btn-accent" id="prompt-ok-btn">确定</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(function() {
    overlay.classList.add('show');
    var input = document.getElementById('prompt-input-field');
    input.focus();
    input.select();
  });

  var okBtn = document.getElementById('prompt-ok-btn');
  var cancelBtn = document.getElementById('prompt-cancel-btn');
  var inputField = document.getElementById('prompt-input-field');

  okBtn.addEventListener('click', function() {
    var val = inputField.value;
    overlay.classList.remove('show');
    setTimeout(function() { overlay.remove(); }, 200);
    if (typeof onConfirm === 'function') onConfirm(val);
  });

  cancelBtn.addEventListener('click', function() {
    overlay.classList.remove('show');
    setTimeout(function() { overlay.remove(); }, 200);
    if (typeof onConfirm === 'function') onConfirm(null);
  });

  // Enter / ESC
  inputField.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') okBtn.click();
    if (e.key === 'Escape') { e.stopPropagation(); cancelBtn.click(); }
  });
}
