(function () {
  const SIDES = ['正面', '反面'];
  const INITIAL_BALANCE = 1000;
  const INTEREST_RATE = 0.003;
  const GROWTH_PRESETS = {
    '20': { base: 20, winBonus: 5, loseBase: 20, losePenalty: 10 },
    '50': { base: 50, winBonus: 10, loseBase: 50, losePenalty: 10 },
    '100': { base: 100, winBonus: 20, loseBase: 100, losePenalty: 15 }
  };
  const SAFE_INTEREST_RATE = 0.0035;
  const SAFE_BONUS_RATE = 0.004;
  const SAFE_LOCK_ROUNDS_BASE = 10;
  const SAFE_LOCK_ROUNDS_PER_WITHDRAW = 30;
  const LOAN_MAX_RATIO_BASE = 0.2;
  const LOAN_ABILITY_FACTOR = 0.3;
  const ABILITY_ROUNDS_THRESHOLD = 50;

  function randomBit() {
    var buf = new Uint8Array(1);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buf);
      return buf[0] % 2;
    }
    return Math.random() < 0.5 ? 0 : 1;
  }

  const coinEl = document.getElementById('coin');
  const flipBtn = document.getElementById('flipBtn');
  const resultEl = document.getElementById('result');
  const balanceEl = document.getElementById('balance');
  const debtEl = document.getElementById('debt');
  const totalAssetsEl = document.getElementById('totalAssets');
  const gameOverLabelEl = document.getElementById('gameOverLabel');
  const borrowInputEl = document.getElementById('borrowAmount');
  const borrowBtn = document.getElementById('borrowBtn');
  const repayInputEl = document.getElementById('repayAmount');
  const repayBtn = document.getElementById('repayBtn');
  const modeDescEl = document.getElementById('modeDesc');
  const preset20Btn = document.getElementById('preset20');
  const preset50Btn = document.getElementById('preset50');
  const preset100Btn = document.getElementById('preset100');
  const safeAmountEl = document.getElementById('safeAmount');
  const safeDepositBtn = document.getElementById('safeDepositBtn');
  const safeWithdrawBtn = document.getElementById('safeWithdrawBtn');
  const safeRetainBtn = document.getElementById('safeRetainBtn');
  const safeStatusEl = document.getElementById('safeStatus');
  const abilityEl = document.getElementById('abilityIndex');
  const loanHintEl = document.getElementById('loanHint');
  const flipDisabledReasonEl = document.getElementById('flipDisabledReason');
  const historyTableBody = document.getElementById('historyTableBody');
  const downloadHistoryBtn = document.getElementById('downloadHistoryBtn');
  const choiceBtns = document.querySelectorAll('.choice-btn');

  let balance = INITIAL_BALANCE;
  let debt = 0;
  let safeBalance = 0;
  var safeDepositRound = null;
  var safeRetainCount = 0;
  var safeWithdrawCount = 0;
  let consecutiveNegativeRounds = 0;
  var growthPreset = '20';
  let gameOver = false;
  let chosenSide = null;
  let basicConsecutiveCorrect = 0;
  let basicConsecutiveWrong = 0;
  let history = [];
  var historyDiff = [];
  var flipCount = 0;

  var chartCanvas = document.getElementById('historyChart');
  var chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

  function totalAssets() {
    return balance - debt;
  }

  function getPresetConfig() {
    return GROWTH_PRESETS[growthPreset];
  }

  function maxLossForPreset() {
    var c = getPresetConfig();
    return c.loseBase + c.losePenalty;
  }

  function getAbility() {
    var flips = history.filter(function (r) { return r.type === 'flip'; });
    if (flips.length < ABILITY_ROUNDS_THRESHOLD) return null;
    var correct = 0;
    for (var i = 0; i < flips.length; i++) {
      if (flips[i].profitLoss > 0) correct += 1;
    }
    return correct / flips.length;
  }

  function getMaxBorrow() {
    var cashFlow = totalAssets();
    if (cashFlow <= 0) return 0;
    var ratio = LOAN_MAX_RATIO_BASE;
    var ability = getAbility();
    if (ability !== null) ratio = LOAN_MAX_RATIO_BASE + LOAN_ABILITY_FACTOR * ability;
    return cashFlow * ratio;
  }

  function updateBalanceDisplay() {
    var total = totalAssets();
    balanceEl.textContent = formatNum(balance);
    if (debtEl) debtEl.textContent = formatNum(debt);
    if (totalAssetsEl) totalAssetsEl.textContent = formatNum(total + safeBalance);
    if (gameOver) {
      gameOverLabelEl.textContent = '清算';
    } else {
      gameOverLabelEl.textContent = '';
    }
    updateSafeUI();
    updateLoanAndAbilityUI();
  }

  function formatNum(x) {
    return Number(x).toFixed(2);
  }

  function setGameOver() {
    gameOver = true;
    flipBtn.disabled = true;
    if (preset20Btn) preset20Btn.disabled = true;
    if (preset50Btn) preset50Btn.disabled = true;
    if (preset100Btn) preset100Btn.disabled = true;
    if (borrowInputEl) borrowInputEl.disabled = true;
    if (borrowBtn) borrowBtn.disabled = true;
    if (repayInputEl) repayInputEl.disabled = true;
    if (repayBtn) repayBtn.disabled = true;
    if (safeAmountEl) safeAmountEl.disabled = true;
    if (safeDepositBtn) safeDepositBtn.disabled = true;
    if (safeWithdrawBtn) safeWithdrawBtn.disabled = true;
    if (safeRetainBtn) safeRetainBtn.disabled = true;
    choiceBtns.forEach(function (btn) { btn.disabled = true; });
    updateBalanceDisplay();
    updateFlipButtonState();
  }

  function updateFlipButtonState() {
    var reason = '';
    if (gameOver) {
      flipBtn.disabled = true;
      reason = '已清算';
    } else {
      var maxLoss = maxLossForPreset();
      flipBtn.disabled = chosenSide === null || balance < maxLoss;
      if (chosenSide === null) reason = '请先选择正面或反面';
      else if (balance < maxLoss) reason = '本金不足（本档最大亏损 ' + formatNum(maxLoss) + '）';
    }
    if (flipDisabledReasonEl) {
      flipDisabledReasonEl.textContent = flipBtn.disabled ? reason : '';
    }
  }

  function setChoice(side) {
    if (gameOver) return;
    chosenSide = side;
    choiceBtns.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.side === String(side) ? 'true' : 'false');
    });
    resultEl.textContent = '';
    resultEl.className = 'result';
    updateFlipButtonState();
  }

  function pushHistoryFlip(round, modeLabel, betAmount, leverage, guess, actual, profitLoss, balanceAfter, debtAfter, safeBalanceAfter) {
    history.push({
      type: 'flip',
      round: round,
      mode: modeLabel,
      betAmount: betAmount,
      leverage: leverage,
      guess: guess,
      actual: actual,
      profitLoss: profitLoss,
      balanceAfter: balanceAfter,
      debtAfter: debtAfter,
      safeBalanceAfter: safeBalanceAfter != null ? safeBalanceAfter : 0
    });
  }

  function pushHistoryAction(actionType, amount, balanceAfter, debtAfter, safeBalanceAfter) {
    history.push({
      type: actionType,
      round: flipCount,
      amount: amount,
      balanceAfter: balanceAfter,
      debtAfter: debtAfter,
      safeBalanceAfter: safeBalanceAfter != null ? safeBalanceAfter : 0
    });
  }

  function doOneFlip(showResultText) {
    if (chosenSide === null || gameOver) return;

    var outcome = randomBit();
    var won = chosenSide === outcome;
    var round = flipCount + 1;
    var cfg = getPresetConfig();
    var profitLoss;

    if (won) {
      basicConsecutiveCorrect += 1;
      basicConsecutiveWrong = 0;
      profitLoss = cfg.base + (basicConsecutiveCorrect >= 2 ? cfg.winBonus : 0);
    } else {
      basicConsecutiveCorrect = 0;
      basicConsecutiveWrong += 1;
      profitLoss = -(cfg.loseBase + (basicConsecutiveWrong >= 2 ? cfg.losePenalty : 0));
    }

    balance += profitLoss;
    if (balance < 0) balance = 0;

    debt = debt * (1 + INTEREST_RATE);

    if (safeDepositRound !== null && flipCount < safeDepositRound + getSafeLockRounds()) {
      safeBalance = safeBalance * (1 + SAFE_INTEREST_RATE);
    }

    pushHistoryFlip(
      round,
      growthPreset,
      cfg.base,
      1.0,
      SIDES[chosenSide],
      SIDES[outcome],
      profitLoss,
      balance,
      debt,
      safeBalance
    );
    flipCount = round;

    var prev = historyDiff.length ? historyDiff[historyDiff.length - 1] : 0;
    historyDiff.push(prev + (outcome === 0 ? 1 : -1));

    coinEl.classList.remove('result-heads', 'result-tails');
    coinEl.classList.add(outcome === 0 ? 'result-heads' : 'result-tails');

    if (showResultText) {
      if (won) {
        resultEl.textContent = '中了！是' + SIDES[outcome] + '。+' + formatNum(profitLoss > 0 ? profitLoss : -profitLoss);
        resultEl.className = 'result win';
      } else {
        resultEl.textContent = '没中，是' + SIDES[outcome] + '。' + formatNum(profitLoss);
        resultEl.className = 'result lose';
      }
    }

    updateBalanceDisplay();
    updateFlipButtonState();
    drawHistoryChart();
    renderHistoryTable();

    if (totalAssets() <= 0) {
      consecutiveNegativeRounds += 1;
      if (consecutiveNegativeRounds >= 3) {
        setGameOver();
      }
    } else {
      consecutiveNegativeRounds = 0;
    }
  }

  function runFlip() {
    if (chosenSide === null || gameOver) return;
    doOneFlip(true);
  }

  function setPreset(p) {
    if (gameOver) return;
    growthPreset = p;
    if (preset20Btn) preset20Btn.setAttribute('aria-pressed', p === '20' ? 'true' : 'false');
    if (preset50Btn) preset50Btn.setAttribute('aria-pressed', p === '50' ? 'true' : 'false');
    if (preset100Btn) preset100Btn.setAttribute('aria-pressed', p === '100' ? 'true' : 'false');
    updatePresetDesc();
    updateFlipButtonState();
  }

  function updatePresetDesc() {
    var c = getPresetConfig();
    var win = '猜对 +' + c.base + (c.winBonus ? '，连续猜对再 +' + c.winBonus : '');
    var lose = '猜错 -' + c.loseBase + (c.losePenalty ? '，连续猜错再 -' + c.losePenalty : '');
    if (modeDescEl) modeDescEl.textContent = win + '；' + lose;
  }

  function getSafeLockRounds() {
    return SAFE_LOCK_ROUNDS_BASE * (safeRetainCount + 1) + SAFE_LOCK_ROUNDS_PER_WITHDRAW * safeWithdrawCount;
  }

  function getSafeMinRatio() {
    if (safeWithdrawCount === 0) return 0.7;
    if (safeWithdrawCount === 1) return 0.8;
    return 0.9;
  }

  function safeCanUnlock() {
    return safeDepositRound !== null && flipCount >= safeDepositRound + getSafeLockRounds();
  }

  function updateSafeUI() {
    if (!safeStatusEl) return;
    if (safeBalance <= 0 && safeDepositRound === null) {
      safeStatusEl.textContent = '保险箱为空';
    } else if (safeCanUnlock()) {
      safeStatusEl.textContent = '可提现或保留（' + formatNum(safeBalance) + '）';
    } else if (safeDepositRound !== null) {
      var lockRounds = getSafeLockRounds();
      var remaining = Math.max(0, safeDepositRound + lockRounds - flipCount);
      safeStatusEl.textContent = '锁定中 ' + formatNum(safeBalance) + '，剩余 ' + remaining + ' 轮（本次锁 ' + lockRounds + ' 轮）';
    }
    if (safeWithdrawBtn) safeWithdrawBtn.style.display = safeCanUnlock() ? '' : 'none';
    if (safeRetainBtn) safeRetainBtn.style.display = safeCanUnlock() ? '' : 'none';
    var canDeposit = safeBalance === 0 && safeDepositRound === null && !gameOver;
    if (safeAmountEl) {
      safeAmountEl.style.display = canDeposit ? '' : 'none';
      if (canDeposit) safeAmountEl.placeholder = '存入金额（≥' + (getSafeMinRatio() * 100) + '%现金流）';
    }
    if (safeDepositBtn) safeDepositBtn.style.display = canDeposit ? '' : 'none';
  }

  function doSafeDeposit() {
    if (gameOver || !safeAmountEl) return;
    if (safeBalance > 0 || safeDepositRound !== null) return;
    var amount = Number(safeAmountEl.value) || 0;
    var cashFlow = totalAssets();
    var minRatio = getSafeMinRatio();
    var minDeposit = cashFlow * minRatio;
    if (amount < minDeposit) return;
    if (amount > balance) amount = balance;
    balance -= amount;
    safeBalance = amount;
    safeDepositRound = flipCount;
    safeRetainCount = 0;
    safeAmountEl.value = '';
    pushHistoryAction('safe_deposit', amount, balance, debt, safeBalance);
    updateBalanceDisplay();
    updateFlipButtonState();
  }

  function doSafeWithdraw() {
    if (gameOver || !safeCanUnlock()) return;
    var withdrawn = safeBalance;
    balance += safeBalance;
    safeBalance = 0;
    safeDepositRound = null;
    safeRetainCount = 0;
    safeWithdrawCount += 1;
    pushHistoryAction('safe_withdraw', withdrawn, balance, debt, 0);
    updateBalanceDisplay();
    updateFlipButtonState();
  }

  function doSafeRetain() {
    if (gameOver || !safeCanUnlock()) return;
    safeBalance = safeBalance * (1 + SAFE_BONUS_RATE);
    safeRetainCount += 1;
    safeDepositRound = flipCount;
    pushHistoryAction('safe_retain', null, balance, debt, safeBalance);
    updateBalanceDisplay();
    updateFlipButtonState();
  }

  function updateLoanAndAbilityUI() {
    if (abilityEl) {
      var ability = getAbility();
      if (ability !== null) {
        abilityEl.style.display = '';
        abilityEl.textContent = '能力指数（猜中率）：' + formatNum(ability * 100) + '%';
      } else {
        abilityEl.style.display = 'none';
      }
    }
    if (loanHintEl) {
      var maxBorrow = getMaxBorrow();
      var cashFlow = totalAssets();
      if (cashFlow <= 0) {
        loanHintEl.textContent = '借款额度：现金流非正时不可借';
      } else if (getAbility() !== null) {
        loanHintEl.textContent = '借款额度最高：' + formatNum(maxBorrow) + '（现金流 × (20% + 30%×能力)）';
      } else {
        loanHintEl.textContent = '借款额度最高：' + formatNum(maxBorrow) + '（现金流 × 20%）';
      }
    }
  }

  function doBorrow() {
    if (gameOver || !borrowInputEl) return;
    var amount = Number(borrowInputEl.value) || 0;
    if (amount <= 0) return;
    var maxBorrow = getMaxBorrow();
    if (amount > maxBorrow) return;
    balance += amount;
    debt += amount;
    borrowInputEl.value = '';
    pushHistoryAction('borrow', amount, balance, debt, safeBalance);
    updateBalanceDisplay();
    updateFlipButtonState();
  }

  function doRepay() {
    if (gameOver || !repayInputEl) return;
    var amount = Number(repayInputEl.value) || 0;
    if (amount <= 0) return;
    amount = Math.min(amount, balance, debt);
    if (amount <= 0) return;
    balance -= amount;
    debt -= amount;
    repayInputEl.value = '';
    pushHistoryAction('repay', amount, balance, debt, safeBalance);
    updateBalanceDisplay();
    updateFlipButtonState();
  }

  function exportHistory() {
    var header = '轮次,类型,模式,下注金额,杠杆,猜测结果,正确答案,损益或金额,本金,负债,保险箱,总资产';
    var rows = history.map(function (r) {
      var d = r.debtAfter != null ? r.debtAfter : 0;
      var tot = r.balanceAfter - d;
      var safe = r.safeBalanceAfter != null ? formatNum(r.safeBalanceAfter) : '';
      if (r.type === 'flip') {
        var pl = r.profitLoss >= 0 ? '+' + formatNum(r.profitLoss) : formatNum(r.profitLoss);
        var lev = Number(r.leverage) === Math.floor(r.leverage) ? r.leverage + '.0' : String(r.leverage);
        return [r.round, '开翻', r.mode, formatNum(r.betAmount), lev, r.guess || '', r.actual || '', pl, formatNum(r.balanceAfter), formatNum(d), safe, formatNum(tot)].join(',');
      }
      var typeLabel = ACTION_TYPE_LABELS[r.type] || r.type;
      var amt = r.amount != null ? formatNum(r.amount) : '';
      return [r.round, typeLabel, '', '', '', '', '', amt, formatNum(r.balanceAfter), formatNum(d), safe, formatNum(tot)].join(',');
    });
    var csv = '\uFEFF' + header + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    var now = new Date();
    var stamp = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '_' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'coin_history_' + stamp + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  var ACTION_TYPE_LABELS = { borrow: '借款', repay: '还款', safe_deposit: '保险箱存入', safe_withdraw: '保险箱提现', safe_retain: '保险箱保留' };

  function renderHistoryTable() {
    if (!historyTableBody) return;
    if (history.length === 0) {
      historyTableBody.innerHTML = '';
      return;
    }
    var rows = history.map(function (r) {
      var round = r.round;
      var bal = formatNum(r.balanceAfter);
      var d = r.debtAfter != null ? formatNum(r.debtAfter) : '-';
      var safe = r.safeBalanceAfter != null ? formatNum(r.safeBalanceAfter) : '-';
      var tot = r.debtAfter != null ? formatNum(r.balanceAfter - r.debtAfter) : formatNum(r.balanceAfter);
      if (r.type === 'flip') {
        var pl = r.profitLoss >= 0 ? '+' + r.profitLoss : String(r.profitLoss);
        var plClass = r.profitLoss >= 0 ? 'pl-win' : 'pl-lose';
        var detail = r.mode + '档 ' + (r.guess || '') + '→' + (r.actual || '');
        return '<tr><td>' + round + '</td><td>开翻(' + detail + ')</td><td class="' + plClass + '">' + pl + '</td><td>' + bal + '</td><td>' + d + '</td><td>' + safe + '</td><td>' + tot + '</td></tr>';
      }
      var typeLabel = ACTION_TYPE_LABELS[r.type] || r.type;
      var amt = r.amount != null ? formatNum(r.amount) : '-';
      return '<tr><td>' + round + '</td><td>' + typeLabel + '</td><td>' + amt + '</td><td>' + bal + '</td><td>' + d + '</td><td>' + safe + '</td><td>' + tot + '</td></tr>';
    });
    historyTableBody.innerHTML = rows.join('');
  }

  function drawHistoryChart() {
    if (!chartCtx || !chartCanvas) return;
    var width = chartCanvas.width;
    var height = chartCanvas.height;
    var padding = { top: 20, right: 44, bottom: 24, left: 32 };
    var plotLeft = padding.left;
    var plotRight = width - padding.right;
    var plotTop = padding.top;
    var plotBottom = height - padding.bottom;
    var plotWidth = plotRight - plotLeft;
    var plotHeight = plotBottom - plotTop;

    chartCtx.clearRect(0, 0, width, height);
    var diffData = historyDiff;
    var n = diffData.length;
    if (n === 0) {
      chartCtx.fillStyle = 'rgba(255,255,255,0.15)';
      chartCtx.font = '12px system-ui, sans-serif';
      chartCtx.fillText('暂无数据', plotLeft, plotTop + plotHeight / 2);
      return;
    }

    var flipEntries = history.filter(function (r) { return r.type === 'flip'; });
    var balanceData = [INITIAL_BALANCE].concat(flipEntries.map(function (r) {
      var base = r.debtAfter != null ? (r.balanceAfter - r.debtAfter) : r.balanceAfter;
      var safe = r.safeBalanceAfter != null ? r.safeBalanceAfter : 0;
      return base + safe;
    }));
    var diffMin = Math.min(0, Math.min.apply(null, diffData));
    var diffMax = Math.max(0, Math.max.apply(null, diffData));
    if (diffMin === diffMax) { diffMin -= 1; diffMax += 1; }
    var diffRange = diffMax - diffMin;
    var balanceMin = 0;
    var balanceMax = Math.max(INITIAL_BALANCE, Math.max.apply(null, balanceData));
    if (balanceMax === balanceMin) balanceMax = balanceMin + 1;
    var balanceRange = balanceMax - balanceMin;

    function xToPixel(k) {
      return plotLeft + (n <= 1 ? 0 : (k / Math.max(1, n - 1)) * plotWidth);
    }
    function yToPixelDiff(v) {
      return plotBottom - ((v - diffMin) / diffRange) * plotHeight;
    }
    function yToPixelBalance(v) {
      return plotBottom - ((v - balanceMin) / balanceRange) * plotHeight;
    }

    chartCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    chartCtx.lineWidth = 1;
    chartCtx.beginPath();
    chartCtx.moveTo(plotLeft, yToPixelDiff(0));
    chartCtx.lineTo(plotRight, yToPixelDiff(0));
    chartCtx.stroke();

    chartCtx.strokeStyle = '#7eb8da';
    chartCtx.lineWidth = 2;
    chartCtx.beginPath();
    for (var i = 0; i < diffData.length; i++) {
      var x = xToPixel(i);
      var y = yToPixelDiff(diffData[i]);
      if (i === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();

    chartCtx.fillStyle = 'rgba(126, 184, 218, 0.15)';
    chartCtx.beginPath();
    chartCtx.moveTo(plotLeft, plotBottom);
    for (var j = 0; j < diffData.length; j++) {
      chartCtx.lineTo(xToPixel(j), yToPixelDiff(diffData[j]));
    }
    chartCtx.lineTo(plotRight, plotBottom);
    chartCtx.closePath();
    chartCtx.fill();

    chartCtx.strokeStyle = '#f0c674';
    chartCtx.lineWidth = 2;
    chartCtx.beginPath();
    for (var b = 0; b < balanceData.length; b++) {
      var xb = xToPixel(b);
      var yb = yToPixelBalance(balanceData[b]);
      if (b === 0) chartCtx.moveTo(xb, yb);
      else chartCtx.lineTo(xb, yb);
    }
    chartCtx.stroke();

    var heads = 0, tails = 0;
    for (var h = 0; h < flipEntries.length; h++) {
      if (flipEntries[h].actual === '正面') heads++; else tails++;
    }
    chartCtx.fillStyle = 'rgba(255,255,255,0.5)';
    chartCtx.font = '10px system-ui, sans-serif';
    chartCtx.textAlign = 'left';
    chartCtx.fillText('正反差', plotLeft, plotTop - 6);
    chartCtx.fillText('资金(含保险箱)', plotRight + 4, plotTop - 6);
    chartCtx.textAlign = 'right';
    chartCtx.fillText('正/反 = ' + heads + ' / ' + tails, plotRight, plotTop - 6);
    chartCtx.textAlign = 'left';
  }

  if (preset20Btn) preset20Btn.addEventListener('click', function () { setPreset('20'); });
  if (preset50Btn) preset50Btn.addEventListener('click', function () { setPreset('50'); });
  if (preset100Btn) preset100Btn.addEventListener('click', function () { setPreset('100'); });
  if (borrowBtn) borrowBtn.addEventListener('click', doBorrow);
  if (repayBtn) repayBtn.addEventListener('click', doRepay);
  if (safeDepositBtn) safeDepositBtn.addEventListener('click', doSafeDeposit);
  if (safeWithdrawBtn) safeWithdrawBtn.addEventListener('click', doSafeWithdraw);
  if (safeRetainBtn) safeRetainBtn.addEventListener('click', doSafeRetain);
  if (downloadHistoryBtn) downloadHistoryBtn.addEventListener('click', exportHistory);

  choiceBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setChoice(parseInt(btn.dataset.side, 10));
    });
  });

  flipBtn.addEventListener('click', runFlip);

  updateBalanceDisplay();
  setPreset('20');
  updateSafeUI();
  drawHistoryChart();
  renderHistoryTable();
})();
