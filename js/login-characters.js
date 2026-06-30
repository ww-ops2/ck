/**
 * 登录界面动画角色逻辑
 * 纯 HTML/CSS/JS 版本 —改编自 React animated-characters-login-page
 *
 * 动画效果：
 * - 眼球追踪鼠标移动
 * - 随机眨眼动画
 * - 输入时身体倾斜
 * - 密码可见时紫色角色偷看
 * - 输入时角色互看
 */

// ============================================================
// 状态管理
// ============================================================
var _loginChars = {
  mouseX: 0,
  mouseY: 0,
  isTyping: false,
  passwordVisible: false,
  passwordLength: 0,
  purpleBlinking: false,
  blackBlinking: false,
  purplePeeking: false,
  lookingAtEachOther: false,
  purpleBlinkTimer: null,
  blackBlinkTimer: null,
  purplePeekTimer: null,
  lookTimer: null,
  _loopRunning: false,
};

// ============================================================
// 初始化
// ============================================================
function initLoginCharacters() {
  console.log('[LoginChars] 初始化开始...');
  try {
    // 验证角色元素是否存在
    var charIds = ['login-char-purple', 'login-char-black', 'login-char-orange', 'login-char-yellow'];
    var foundCount = 0;
    charIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        foundCount++;
        var r = el.getBoundingClientRect();
        console.log('[LoginChars] 角色 ' + id + ' 尺寸:', r.width + 'x' + r.height, '位置:', Math.round(r.left) + ',' + Math.round(r.top));
      } else {
        console.warn('[LoginChars] 未找到角色元素: ' + id);
      }
    });
    console.log('[LoginChars] 找到 ' + foundCount + '/4 个角色元素');

    // 鼠标追踪
    document.addEventListener('mousemove', function(e) {
      _loginChars.mouseX = e.clientX;
      _loginChars.mouseY = e.clientY;
    });

  // 输入框焦点追踪
  var phoneInput = document.getElementById('login-phone');
  var passwordInput = document.getElementById('login-password');

  if (phoneInput) {
    phoneInput.addEventListener('focus', function() { _loginChars.isTyping = true; updateLoginChars(); });
    phoneInput.addEventListener('blur', function() { _loginChars.isTyping = false; updateLoginChars(); });
  }
  if (passwordInput) {
    passwordInput.addEventListener('focus', function() { _loginChars.isTyping = true; updateLoginChars(); });
    passwordInput.addEventListener('blur', function() { _loginChars.isTyping = false; updateLoginChars(); });
    passwordInput.addEventListener('input', function() {
      _loginChars.passwordLength = passwordInput.value.length;
      updateLoginChars();
    });
  }

  // 密码可见切换
  var eyeBtn = document.getElementById('login-eye-btn');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', function() {
      _loginChars.passwordVisible = !_loginChars.passwordVisible;
      var pwdInput = document.getElementById('login-password');
      if (pwdInput) {
        pwdInput.type = _loginChars.passwordVisible ? 'text' : 'password';
      }
      // 切换图标
      var openIcon = eyeBtn.querySelector('.login-eye-open');
      var offIcon = eyeBtn.querySelector('.login-eye-off');
      if (openIcon && offIcon) {
        openIcon.style.display = _loginChars.passwordVisible ? 'none' : '';
        offIcon.style.display = _loginChars.passwordVisible ? '' : 'none';
      }
      updateLoginChars();
    });
  }

  // 启动眨眼循环
  startBlinking('purple');
  startBlinking('black');

  // 持续动画帧（带自愈机制）
  _loginChars._loopRunning = true;
  requestAnimationFrame(loginCharsAnimLoop);
  console.log('[LoginChars] 初始化完成，动画循环已启动');
} catch (err) {
  console.error('[LoginChars] 初始化失败:', err);
}
}

// 自愈检查 — 每 3 秒确认动画循环仍在运行
setInterval(function() {
  if (!_loginChars._loopRunning) {
    console.warn('[LoginChars] 动画循环停止，尝试重启...');
    _loginChars._loopRunning = true;
    requestAnimationFrame(loginCharsAnimLoop);
  }
}, 3000);

// ============================================================
// 眨眼动画
// ============================================================
function startBlinking(charName) {
  var randomInterval = Math.random() * 4000 + 3000;
  var timer = setTimeout(function() {
    if (charName === 'purple') _loginChars.purpleBlinking = true;
    if (charName === 'black') _loginChars.blackBlinking = true;
    updateLoginChars();

    setTimeout(function() {
      if (charName === 'purple') _loginChars.purpleBlinking = false;
      if (charName === 'black') _loginChars.blackBlinking = false;
      updateLoginChars();
      startBlinking(charName);
    }, 150);
  }, randomInterval);

  if (charName === 'purple') _loginChars.purpleBlinkTimer = timer;
  if (charName === 'black') _loginChars.blackBlinkTimer = timer;
}

// ============================================================
// 输入时互看动画
// ============================================================
function triggerLookAtEachOther() {
  _loginChars.lookingAtEachOther = true;
  updateLoginChars();
  if (_loginChars.lookTimer) clearTimeout(_loginChars.lookTimer);
  _loginChars.lookTimer = setTimeout(function() {
    _loginChars.lookingAtEachOther = false;
    updateLoginChars();
  }, 800);
}

// ============================================================
// 密码可见时紫色偷看动画
// ============================================================
function startPurplePeeking() {
  if (!_loginChars.passwordVisible || _loginChars.passwordLength <= 0) return;
  var randomInterval = Math.random() * 3000 + 2000;
  _loginChars.purplePeekTimer = setTimeout(function() {
    _loginChars.purplePeeking = true;
    updateLoginChars();
    setTimeout(function() {
      _loginChars.purplePeeking = false;
      updateLoginChars();
      startPurplePeeking();
    }, 800);
  }, randomInterval);
}

function stopPurplePeeking() {
  _loginChars.purplePeeking = false;
  if (_loginChars.purplePeekTimer) clearTimeout(_loginChars.purplePeekTimer);
}

// ============================================================
// 更新角色状态
// ============================================================
function updateLoginChars() {
  // 输入时触发互看
  if (_loginChars.isTyping && !_loginChars.lookingAtEachOther) {
    triggerLookAtEachOther();
  }

  // 密码可见偷看
  if (_loginChars.passwordVisible && _loginChars.passwordLength > 0 && !_loginChars.purplePeeking && !_loginChars.purplePeekTimer) {
    startPurplePeeking();
  } else if (!_loginChars.passwordVisible || _loginChars.passwordLength <= 0) {
    stopPurplePeeking();
  }
}

// ============================================================
// 动画帧循环 — 更新所有角色位置和眼球
// ============================================================
function loginCharsAnimLoop() {
  try {
    updateAllCharPositions();
    updateAllPupils();
  } catch (err) {
    console.warn('[LoginChars] 动画帧错误:', err);
  }
  _loginChars._loopRunning = true;
  requestAnimationFrame(loginCharsAnimLoop);
}

function calculateCharPosition(charEl) {
  if (!charEl) return { faceX: 0, faceY: 0, bodySkew: 0 };

  var rect = charEl.getBoundingClientRect();
  var centerX = rect.left + rect.width / 2;
  var centerY = rect.top + rect.height / 3;

  var deltaX = _loginChars.mouseX - centerX;
  var deltaY = _loginChars.mouseY - centerY;

  var faceX = Math.max(-15, Math.min(15, deltaX / 20));
  var faceY = Math.max(-10, Math.min(10, deltaY / 30));
  var bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));

  return { faceX, faceY, bodySkew };
}

function updateAllCharPositions() {
  var purpleEl = document.getElementById('login-char-purple');
  var blackEl = document.getElementById('login-char-black');
  var orangeEl = document.getElementById('login-char-orange');
  var yellowEl = document.getElementById('login-char-yellow');

  var pwd = _loginChars.passwordLength > 0;
  var pwdVis = _loginChars.passwordVisible;
  var typing = _loginChars.isTyping;
  var looking = _loginChars.lookingAtEachOther;

  var purplePos = calculateCharPosition(purpleEl);
  var blackPos = calculateCharPosition(blackEl);
  var orangePos = calculateCharPosition(orangeEl);
  var yellowPos = calculateCharPosition(yellowEl);

  // 紫色角色
  if (purpleEl) {
    var purpleHeight = (typing || (pwd && !pwdVis)) ? 440 : 400;
    purpleEl.style.height = purpleHeight + 'px';

    if (pwdVis) {
      purpleEl.style.transform = 'skewX(0deg)';
    } else if (typing || (pwd && !pwdVis)) {
      purpleEl.style.transform = 'skewX(' + ((purplePos.bodySkew || 0) - 12) + 'deg) translateX(40px)';
    } else {
      purpleEl.style.transform = 'skewX(' + (purplePos.bodySkew || 0) + 'deg)';
    }
  }

  // 黑色角色
  if (blackEl) {
    if (pwdVis) {
      blackEl.style.transform = 'skewX(0deg)';
    } else if (looking) {
      blackEl.style.transform = 'skewX(' + ((blackPos.bodySkew || 0) * 1.5 + 10) + 'deg) translateX(20px)';
    } else if (typing || (pwd && !pwdVis)) {
      blackEl.style.transform = 'skewX(' + ((blackPos.bodySkew || 0) * 1.5) + 'deg)';
    } else {
      blackEl.style.transform = 'skewX(' + (blackPos.bodySkew || 0) + 'deg)';
    }
  }

  // 橙色角色
  if (orangeEl) {
    if (pwdVis) {
      orangeEl.style.transform = 'skewX(0deg)';
    } else {
      orangeEl.style.transform = 'skewX(' + (orangePos.bodySkew || 0) + 'deg)';
    }
  }

  // 黄色角色
  if (yellowEl) {
    if (pwdVis) {
      yellowEl.style.transform = 'skewX(0deg)';
    } else {
      yellowEl.style.transform = 'skewX(' + (yellowPos.bodySkew || 0) + 'deg)';
    }
  }

  // 紫色眼睛位置
  var purpleEyes = document.getElementById('login-purple-eyes');
  if (purpleEyes) {
    if (pwdVis) {
      purpleEyes.style.left = '20px';
      purpleEyes.style.top = '35px';
    } else if (looking) {
      purpleEyes.style.left = '55px';
      purpleEyes.style.top = '65px';
    } else {
      purpleEyes.style.left = (45 + purplePos.faceX) + 'px';
      purpleEyes.style.top = (40 + purplePos.faceY) + 'px';
    }
  }

  // 黑色眼睛位置
  var blackEyes = document.getElementById('login-black-eyes');
  if (blackEyes) {
    if (pwdVis) {
      blackEyes.style.left = '10px';
      blackEyes.style.top = '28px';
    } else if (looking) {
      blackEyes.style.left = '32px';
      blackEyes.style.top = '12px';
    } else {
      blackEyes.style.left = (26 + blackPos.faceX) + 'px';
      blackEyes.style.top = (32 + blackPos.faceY) + 'px';
    }
  }

  // 橙色瞳孔位置
  var orangeEyes = document.getElementById('login-orange-eyes');
  if (orangeEyes) {
    if (pwdVis) {
      orangeEyes.style.left = '50px';
      orangeEyes.style.top = '85px';
    } else {
      orangeEyes.style.left = (82 + (orangePos.faceX || 0)) + 'px';
      orangeEyes.style.top = (90 + (orangePos.faceY || 0)) + 'px';
    }
  }

  // 黄色瞳孔位置
  var yellowEyes = document.getElementById('login-yellow-eyes');
  if (yellowEyes) {
    if (pwdVis) {
      yellowEyes.style.left = '20px';
      yellowEyes.style.top = '35px';
    } else {
      yellowEyes.style.left = (52 + (yellowPos.faceX || 0)) + 'px';
      yellowEyes.style.top = (40 + (yellowPos.faceY || 0)) + 'px';
    }
  }

  // 黄色嘴巴位置
  var yellowMouth = document.getElementById('login-yellow-mouth');
  if (yellowMouth) {
    if (pwdVis) {
      yellowMouth.style.left = '10px';
      yellowMouth.style.top = '88px';
    } else {
      yellowMouth.style.left = (40 + (yellowPos.faceX || 0)) + 'px';
      yellowMouth.style.top = (88 + (yellowPos.faceY || 0)) + 'px';
    }
  }
}

function updateAllPupils() {
  var pwd = _loginChars.passwordLength > 0;
  var pwdVis = _loginChars.passwordVisible;
  var looking = _loginChars.lookingAtEachOther;
  var peeking = _loginChars.purplePeeking;

  // 眼球追踪 — 白色眼球内的瞳孔
  var eyeballs = document.querySelectorAll('.login-eyeball');
  eyeballs.forEach(function(eyeball) {
    var charName = eyeball.getAttribute('data-char');
    var isBlinking = (charName === 'purple' && _loginChars.purpleBlinking) ||
                    (charName === 'black' && _loginChars.blackBlinking);

    // 眨眼 — 缩小高度
    if (isBlinking) {
      eyeball.style.height = '2px';
    } else {
      eyeball.style.height = eyeball.style.width; // 正常圆形
    }

    // 瞳孔追踪
    var pupil = eyeball.querySelector('.login-pupil');
    if (!pupil) return;
    if (isBlinking) {
      pupil.style.display = 'none';
      return;
    }
    pupil.style.display = '';

    // 计算瞳孔位置
    var eyeRect = eyeball.getBoundingClientRect();
    var eyeCenterX = eyeRect.left + eyeRect.width / 2;
    var eyeCenterY = eyeRect.top + eyeRect.height / 2;

    var maxDist = charName === 'purple' ? 5 : 4;

    // 强制方向（密码可见偷看/互看）
    var forceX, forceY;
    if (pwdVis && charName === 'purple') {
      forceX = peeking ? 4 : -4;
      forceY = peeking ? 5 : -4;
    } else if (pwdVis && charName === 'black') {
      forceX = -4;
      forceY = -4;
    } else if (looking && charName === 'purple') {
      forceX = 3;
      forceY = 4;
    } else if (looking && charName === 'black') {
      forceX = 0;
      forceY = -4;
    } else {
      forceX = undefined;
      forceY = undefined;
    }

    if (forceX !== undefined && forceY !== undefined) {
      pupil.style.transform = 'translate(' + forceX + 'px, ' + forceY + 'px)';
    } else {
      var dx = _loginChars.mouseX - eyeCenterX;
      var dy = _loginChars.mouseY - eyeCenterY;
      var dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
      var angle = Math.atan2(dy, dx);
      var px = Math.cos(angle) * dist;
      var py = Math.sin(angle) * dist;
      pupil.style.transform = 'translate(' + px + 'px, ' + py + 'px)';
    }
  });

  // 纯瞳孔追踪（橙色、黄色 — 无白色眼球）
  var standalonePupils = document.querySelectorAll('.login-pupil-standalone');
  standalonePupils.forEach(function(pupil) {
    var charName = pupil.getAttribute('data-char');

    // 强制方向（密码可见时看向左边）
    var forceX, forceY;
    if (pwdVis) {
      forceX = -5;
      forceY = -4;
    } else {
      forceX = undefined;
      forceY = undefined;
    }

    if (forceX !== undefined && forceY !== undefined) {
      pupil.style.transform = 'translate(' + forceX + 'px, ' + forceY + 'px)';
    } else {
      var rect = pupil.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;

      var dx = _loginChars.mouseX - centerX;
      var dy = _loginChars.mouseY - centerY;
      var maxDist = 5;
      var dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
      var angle = Math.atan2(dy, dx);
      var px = Math.cos(angle) * dist;
      var py = Math.sin(angle) * dist;
      pupil.style.transform = 'translate(' + px + 'px, ' + py + 'px)';
    }
  });
}
