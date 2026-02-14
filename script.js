(function () {
  const SIDES = ['正面', '反面'];
  const INITIAL_BALANCE = 1000;
  const BASIC_STAKE = 20;
  const MARGIN = 100;

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
  const gameOverLabelEl = document.getElementById('gameOverLabel');
  const modeBasicBtn = document.getElementById('modeBasic');
  const modeStakeBtn = document.getElementById('modeStake');
  const modeDescEl = document.getElementById('modeDesc');
  const stakePanelEl = document.getElementById('stakePanel');
  const betAmountEl = document.getElementById('betAmount');
  const leverageEl = document.getElementById('leverage');
  const stakeHintEl = document.getElementById('stakeHint');
  const allinBtn = document.getElementById('allinBtn');
  const historyTableBody = document.getElementById('historyTableBody');
  const downloadHistoryBtn = document.getElementById('downloadHistoryBtn');
  const choiceBtns = document.querySelectorAll('.choice-btn');

  let balance = INITIAL_BALANCE;
  let mode = 'basic';
  let gameOver = false;
  let chosenSide = null;
  let basicConsecutiveCorrect = 0;
  let basicConsecutiveWrong = 0;
  let history = [];
  var historyDiff = [];

  var chartCanvas = document.getElementById('historyChart');
  var chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

  function effectiveStake(bet, lev) {
    return Math.ceil(Number(bet) * Number(lev));
  }

  function canFlipStake() {
    var bet = Math.floor(Number(betAmountEl.value) || 0);
    var lev = Number(leverageEl.value) || 1;
    if (bet <= 0 || lev < 1) return false;
    if (bet > balance) return false;
    if (balance <= MARGIN) return false;
    var eff = effectiveStake(bet, lev);
    return eff >= 200 && eff <= balance - MARGIN;
  }

  function updateBalanceDisplay() {
    balanceEl.textContent = balance;
    if (gameOver) {
      gameOverLabelEl.textContent = '清算';
    } else {
      gameOverLabelEl.textContent = '';
      if (mode === 'stake') {
        betAmountEl.max = balance;
        var bet = parseInt(betAmountEl.value, 10);
        if (!isNaN(bet) && bet > balance) betAmountEl.value = balance;
        updateStakeHint();
        updateFlipButtonState();
      }
    }
  }

  function setGameOver() {
    gameOver = true;
    flipBtn.disabled = true;
    allinBtn.disabled = true;
    modeBasicBtn.disabled = true;
    modeStakeBtn.disabled = true;
    betAmountEl.disabled = true;
    leverageEl.disabled = true;
    choiceBtns.forEach(function (btn) { btn.disabled = true; });
    updateBalanceDisplay();
  }

  function updateFlipButtonState() {
    if (gameOver) return;
    if (mode === 'basic') {
      flipBtn.disabled = chosenSide === null || balance < BASIC_STAKE;
    } else {
      flipBtn.disabled = chosenSide === null || !canFlipStake();
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

  function pushHistory(round, modeLabel, betAmount, leverage, guess, actual, profitLoss, balanceAfter) {
    history.push({
      round: round,
      mode: modeLabel,
      betAmount: betAmount,
      leverage: leverage,
      guess: guess,
      actual: actual,
      profitLoss: profitLoss,
      balanceAfter: balanceAfter
    });
  }

  function doOneFlip(showResultText) {
    if (chosenSide === null || gameOver) return;

    // 结果仅在点击时生成，不预计算，避免通过开发者工具提前看到答案
    var outcome = randomBit();
    var won = chosenSide === outcome;
    var round = history.length + 1;
    var betAmountNum, leverageNum, profitLoss, modeLabel;

    if (mode === 'basic') {
      betAmountNum = BASIC_STAKE;
      leverageNum = 1.0;
      if (won) {
        basicConsecutiveCorrect += 1;
        basicConsecutiveWrong = 0;
        profitLoss = 20 + (basicConsecutiveCorrect >= 2 ? 5 : 0);
      } else {
        basicConsecutiveCorrect = 0;
        basicConsecutiveWrong += 1;
        profitLoss = -20 - (basicConsecutiveWrong >= 2 ? 10 : 0);
      }
      modeLabel = '基础';
    } else {
      betAmountNum = Math.floor(Number(betAmountEl.value) || 0);
      leverageNum = Number(leverageEl.value) || 1;
      var effective = effectiveStake(betAmountNum, leverageNum);
      profitLoss = won ? effective : -effective;
      modeLabel = '博弈';
    }

    balance += profitLoss;
    if (balance < 0) balance = 0;

    pushHistory(
      round,
      modeLabel,
      mode === 'basic' ? 20 : betAmountNum,
      mode === 'basic' ? 1.0 : leverageNum,
      SIDES[chosenSide],
      SIDES[outcome],
      profitLoss,
      balance
    );

    var prev = historyDiff.length ? historyDiff[historyDiff.length - 1] : 0;
    historyDiff.push(prev + (outcome === 0 ? 1 : -1));

    coinEl.classList.remove('result-heads', 'result-tails');
    coinEl.classList.add(outcome === 0 ? 'result-heads' : 'result-tails');

    if (showResultText) {
      if (won) {
        resultEl.textContent = '中了！是' + SIDES[outcome] + '。+' + (profitLoss > 0 ? profitLoss : -profitLoss);
        resultEl.className = 'result win';
      } else {
        resultEl.textContent = '没中，是' + SIDES[outcome] + '。' + profitLoss;
        resultEl.className = 'result lose';
      }
    }

    updateBalanceDisplay();
    updateFlipButtonState();
    drawHistoryChart();
    renderHistoryTable();

    if (balance <= 0) {
      setGameOver();
    }
  }

  function runFlip() {
    if (chosenSide === null || gameOver) return;
    if (mode === 'stake' && !canFlipStake()) return;
    doOneFlip(true);
  }

  function setMode(m) {
    if (gameOver) return;
    mode = m;
    modeBasicBtn.setAttribute('aria-pressed', m === 'basic' ? 'true' : 'false');
    modeStakeBtn.setAttribute('aria-pressed', m === 'stake' ? 'true' : 'false');
    if (m === 'basic') {
      modeDescEl.textContent = '猜对 +20，连续猜对额外 +5；猜错 -20，连续猜错额外 -10';
      stakePanelEl.hidden = true;
    } else {
      modeDescEl.textContent = '下注×杠杆为有效额，猜对得有效额，猜错扣有效额（有效额≥200，且须预留' + MARGIN + '元保证金）';
      stakePanelEl.hidden = false;
      betAmountEl.max = balance;
      updateStakeHint();
      basicConsecutiveCorrect = 0;
      basicConsecutiveWrong = 0;
    }
    updateFlipButtonState();
  }

  function updateStakeHint() {
    var bet = Math.floor(Number(betAmountEl.value) || 0);
    var lev = Number(leverageEl.value) || 1;
    var eff = effectiveStake(bet, lev);
    var maxEff = balance > MARGIN ? balance - MARGIN : 0;
    if (bet <= 0 || lev < 1) {
      stakeHintEl.textContent = '有效额 = ⌈下注×杠杆⌉，须 ≥ 200 且 ≤ 本金−' + MARGIN + '（保证金）';
      return;
    }
    var ok = eff >= 200 && eff <= maxEff;
    if (ok) {
      stakeHintEl.textContent = '有效额 = ' + eff + '（符合）';
    } else if (eff < 200) {
      stakeHintEl.textContent = '有效额 = ' + eff + '（须 ≥ 200）';
    } else {
      stakeHintEl.textContent = '有效额 = ' + eff + '（须 ≤ 本金−' + MARGIN + '，预留保证金）';
    }
  }

  function allIn() {
    if (gameOver) return;
    if (balance <= MARGIN) return;
    var lev = Number(leverageEl.value) || 1;
    var maxEff = balance - MARGIN;
    var bet = Math.floor(maxEff / lev);
    betAmountEl.value = String(Math.max(1, bet));
    betAmountEl.max = balance;
    updateStakeHint();
    updateFlipButtonState();
  }

  function exportHistory() {
    var header = '轮次,模式,下注金额,杠杆,猜测结果,正确答案,损益,剩余本金';
    var rows = history.map(function (r) {
      var pl = r.profitLoss >= 0 ? '+' + r.profitLoss : String(r.profitLoss);
      var lev = Number(r.leverage) === Math.floor(r.leverage) ? r.leverage + '.0' : String(r.leverage);
      return [r.round, r.mode, r.betAmount, lev, r.guess, r.actual, pl, r.balanceAfter].join(',');
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

  function renderHistoryTable() {
    if (!historyTableBody) return;
    if (history.length === 0) {
      historyTableBody.innerHTML = '';
      return;
    }
    var rows = history.map(function (r) {
      var pl = r.profitLoss >= 0 ? '+' + r.profitLoss : String(r.profitLoss);
      var lev = Number(r.leverage) === Math.floor(r.leverage) ? r.leverage + '.0' : String(r.leverage);
      var plClass = r.profitLoss >= 0 ? 'pl-win' : 'pl-lose';
      return '<tr><td>' + r.round + '</td><td>' + r.mode + '</td><td>' + r.betAmount + '</td><td>' + lev + '</td><td>' + r.guess + '</td><td>' + r.actual + '</td><td class="' + plClass + '">' + pl + '</td><td>' + r.balanceAfter + '</td></tr>';
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

    var balanceData = [INITIAL_BALANCE].concat(history.map(function (r) { return r.balanceAfter; }));
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
    for (var h = 0; h < history.length; h++) {
      if (history[h].actual === '正面') heads++; else tails++;
    }
    chartCtx.fillStyle = 'rgba(255,255,255,0.5)';
    chartCtx.font = '10px system-ui, sans-serif';
    chartCtx.textAlign = 'left';
    chartCtx.fillText('正反差', plotLeft, plotTop - 6);
    chartCtx.fillText('资金', plotRight + 4, plotTop - 6);
    chartCtx.textAlign = 'right';
    chartCtx.fillText('正/反 = ' + heads + ' / ' + tails, plotRight, plotTop - 6);
    chartCtx.textAlign = 'left';
  }

  modeBasicBtn.addEventListener('click', function () { setMode('basic'); });
  modeStakeBtn.addEventListener('click', function () { setMode('stake'); });
  betAmountEl.addEventListener('input', function () {
    var v = parseInt(this.value, 10);
    if (!isNaN(v) && v > balance) this.value = balance;
    updateStakeHint();
    updateFlipButtonState();
  });
  leverageEl.addEventListener('input', function () {
    var v = parseFloat(this.value);
    if (!isNaN(v) && v < 1) this.value = 1;
    updateStakeHint();
    updateFlipButtonState();
  });
  document.querySelectorAll('.leverage-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var x = parseInt(this.getAttribute('data-x'), 10);
      if (!isNaN(x) && x >= 1) {
        leverageEl.value = x;
        updateStakeHint();
        updateFlipButtonState();
      }
    });
  });
  allinBtn.addEventListener('click', allIn);
  if (downloadHistoryBtn) downloadHistoryBtn.addEventListener('click', exportHistory);

  choiceBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setChoice(parseInt(btn.dataset.side, 10));
    });
  });

  flipBtn.addEventListener('click', runFlip);

  updateBalanceDisplay();
  setMode('basic');
  drawHistoryChart();
  renderHistoryTable();
})();
