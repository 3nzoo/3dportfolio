import { BALLS_PER_ROUND } from '../game/play-round.js';
import { COUNTRIES, countryFlag, searchCountries } from '../game/countries.js';

const PLAY_ICON = '<path d="m8 5 11 7-11 7Z"/>';
const PORTFOLIO_ICON = '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18"/>';
const TROPHY_ICON = '<path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 5 4m7-6h4v2a4 4 0 0 1-5 4m-3 1v5m-4 3h8m-7-3h6"/>';

export function createPlayModeUI({ onToggle, onReplay, onPortfolio, onSaveRecord }) {
  const modeButton = document.querySelector('#toggle-play-mode');
  const aim = document.querySelector('.aim-control');
  const destinations = document.querySelector('.destination-options');
  const rack = document.createElement('ol');
  rack.className = 'ball-rack';
  rack.hidden = true;
  rack.setAttribute('aria-label', 'Your ten balls');
  rack.innerHTML = Array.from({ length: BALLS_PER_ROUND }, (_, index) => `<li class="rack-slot"><span class="rack-ball" aria-hidden="true"></span><span class="sr-only">Ball ${index + 1}</span></li>`).join('');
  aim.prepend(rack);
  const power = document.createElement('div');
  power.className = 'power-readout';
  power.hidden = true;
  power.innerHTML = '<span>Launch strength</span><output for="launch-position">50%</output>';
  aim.append(power);
  const scoreboard = document.createElement('aside');
  scoreboard.className = 'play-scoreboard';
  scoreboard.hidden = true;
  scoreboard.setAttribute('aria-label', 'Play mode score');
  scoreboard.innerHTML = `<p class="play-kicker"><span></span>THE TEN BALL CHALLENGE</p>
    <div class="play-score-grid"><div class="current-score"><span class="score-label">YOUR SCORE</span><strong id="play-score">0</strong><span class="score-unit">POINTS</span></div>
    <div class="best-record"><span class="score-label"><svg viewBox="0 0 24 24" aria-hidden="true">${TROPHY_ICON}</svg>TOP SCORE</span><strong class="record-score">500</strong><span class="record-player"><span class="record-flag" role="img" aria-label="Philippines">🇵🇭</span><span class="record-name">Enzo</span></span></div></div>
    <div class="shot-readout"><span id="play-ball-count">Ball 1 / 10</span><span><b id="play-pin-hits">0</b> pin hits</span></div>
    <p class="shot-result" id="play-shot-result" role="status" aria-live="polite">Set your strength. Make every bounce count.</p>
    <p class="play-rule">Pin hits × pocket multiplier = points</p>`;
  document.querySelector('#game-hud').append(scoreboard);
  const dialog = document.createElement('dialog');
  dialog.className = 'round-dialog';
  dialog.setAttribute('aria-labelledby', 'round-title');
  dialog.setAttribute('aria-describedby', 'round-description');
  dialog.innerHTML = `<button type="button" class="round-close" aria-label="Close round summary"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <div class="round-emblem"><svg viewBox="0 0 24 24" aria-hidden="true">${TROPHY_ICON}</svg></div>
    <p class="play-kicker">TEN BALLS. YOUR MARK.</p><h2 id="round-title">Round complete</h2>
    <p id="round-description">Every bounce added up.</p>
    <div class="round-total"><strong id="round-score">0</strong><span>POINTS</span></div>
    <p class="round-breakdown"></p>
    <form id="record-form" hidden>
      <label for="record-name">Your name</label>
      <div class="record-name-field"><span id="record-country-flag" role="img" aria-label="Choose a country">🌐</span><input id="record-name" name="name" autocomplete="nickname" placeholder="Your name on the board" maxlength="24" required /></div>
      <label for="record-country">Country or region</label>
      <div class="country-picker"><input id="record-country" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="country-results" autocomplete="off" placeholder="Search your country…" required /><ul id="country-results" role="listbox" aria-label="Countries and regions" hidden></ul></div>
      <button class="round-primary" type="submit">Save my score <span aria-hidden="true">↗</span></button>
      <p class="record-note">Saved on this browser. A shared leaderboard is coming soon.</p>
    </form>
    <p class="record-saved" role="status" hidden></p>
    <div class="round-actions"><button type="button" class="round-primary" data-round-replay>Play again <span aria-hidden="true">↗</span></button><button type="button" class="round-secondary" data-round-portfolio>Back to portfolio</button></div>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const nameInput = dialog.querySelector('#record-name');
  const countryInput = dialog.querySelector('#record-country');
  const countryResults = dialog.querySelector('#country-results');
  const flag = dialog.querySelector('#record-country-flag');
  let selectedCountry = null, results = [], activeOption = -1;
  function closeCountries() {
    countryResults.hidden = true;
    countryInput.setAttribute('aria-expanded', 'false');
    countryInput.removeAttribute('aria-activedescendant');
    activeOption = -1;
  }
  function chooseCountry(country) {
    selectedCountry = country;
    countryInput.value = country.name;
    countryInput.setCustomValidity('');
    flag.textContent = countryFlag(country.code);
    flag.setAttribute('aria-label', country.name);
    closeCountries();
  }
  function renderCountries() {
    results = searchCountries(countryInput.value).slice(0, 8);
    activeOption = -1;
    countryInput.removeAttribute('aria-activedescendant');
    countryResults.replaceChildren();
    for (const country of results) {
      const option = document.createElement('li');
      option.id = `country-${country.code}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(selectedCountry?.code === country.code));
      option.textContent = `${countryFlag(country.code)}  ${country.name}`;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => { chooseCountry(country); countryInput.focus(); });
      countryResults.append(option);
    }
    if (!results.length) {
      const empty = document.createElement('li');
      empty.className = 'country-empty';
      empty.textContent = 'No match. Try another country name.';
      countryResults.append(empty);
    }
    countryResults.hidden = false;
    countryInput.setAttribute('aria-expanded', 'true');
  }
  countryInput.addEventListener('input', () => {
    selectedCountry = COUNTRIES.find(country => country.name.toLowerCase() === countryInput.value.trim().toLowerCase()) || null;
    countryInput.setCustomValidity(selectedCountry ? '' : 'Choose a country from the search results.');
    flag.textContent = countryFlag(selectedCountry?.code);
    flag.setAttribute('aria-label', selectedCountry?.name || 'Choose a country');
    renderCountries();
  });
  countryInput.addEventListener('focus', renderCountries);
  countryInput.addEventListener('blur', closeCountries);
  countryInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (countryResults.hidden) renderCountries();
      if (!results.length) return;
      activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      [...countryResults.children].forEach((item, index) => item.setAttribute('aria-selected', String(index === activeOption)));
      countryInput.setAttribute('aria-activedescendant', `country-${results[activeOption].code}`);
      countryResults.children[activeOption].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !countryResults.hidden && activeOption >= 0) {
      event.preventDefault();
      chooseCountry(results[activeOption]);
    } else if (event.key === 'Escape' && !countryResults.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeCountries();
    }
  });
  function closeDialog() {
    closeCountries();
    if (dialog.open) dialog.close();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!selectedCountry || !nameInput.value.trim()) {
      nameInput.setCustomValidity(nameInput.value.trim() ? '' : 'Enter your name.');
      form.reportValidity();
      return;
    }
    const saved = onSaveRecord({ name: nameInput.value, country: selectedCountry.code });
    if (!saved) return;
    form.hidden = true;
    const savedMessage = dialog.querySelector('.record-saved');
    savedMessage.textContent = `${countryFlag(selectedCountry.code)} ${nameInput.value.trim()} — your record is on the board.`;
    savedMessage.hidden = false;
    dialog.querySelector('#round-title').textContent = 'You’re on the board.';
    dialog.querySelector('#round-description').textContent = 'Your personal best is ready for the next challenger on this browser.';
    dialog.querySelector('[data-round-replay]').focus();
  });
  nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
  modeButton.addEventListener('click', onToggle);
  dialog.querySelector('.round-close').addEventListener('click', closeDialog);
  dialog.querySelector('[data-round-replay]').addEventListener('click', () => { closeDialog(); onReplay(); });
  dialog.querySelector('[data-round-portfolio]').addEventListener('click', () => { closeDialog(); onPortfolio(); });
  dialog.addEventListener('close', () => modeButton.focus({ preventScroll: true }));
  return {
    get dialogOpen() { return dialog.open; },
    setPower(percent) { power.querySelector('output').textContent = `${percent}%`; },
    render(round, { playing, best, ready }) {
      rack.hidden = power.hidden = scoreboard.hidden = !playing;
      destinations.hidden = playing;
      modeButton.disabled = !ready;
      modeButton.setAttribute('aria-pressed', String(playing));
      modeButton.setAttribute('aria-label', playing ? 'Return to portfolio mode' : 'Enter play mode');
      modeButton.title = playing ? 'Leave the game and return to the portfolio' : 'Play the ten ball challenge';
      modeButton.querySelector('svg').innerHTML = playing ? PORTFOLIO_ICON : PLAY_ICON;
      modeButton.querySelector('span').textContent = playing ? 'Portfolio' : 'Play';
      const shots = round.shots;
      [...rack.children].forEach((slot, index) => {
        const state = index < shots.length ? 'used' : index === shots.length ? (round.inFlight ? 'active' : 'next') : 'queued';
        slot.dataset.state = state;
        slot.setAttribute('aria-label', `Ball ${index + 1}: ${index < shots.length ? `${shots[index].points} points` : state === 'active' ? 'in play' : state === 'next' ? 'next to launch' : 'remaining'}`);
        if (state === 'active' || state === 'next') slot.setAttribute('aria-current', 'step');
        else slot.removeAttribute('aria-current');
      });
      scoreboard.querySelector('#play-score').textContent = round.score.toLocaleString();
      scoreboard.querySelector('#play-pin-hits').textContent = round.hits;
      scoreboard.querySelector('#play-ball-count').textContent = round.completed ? '10 / 10 complete' : `Ball ${round.ballNumber} / 10`;
      scoreboard.querySelector('.record-score').textContent = best.score.toLocaleString();
      scoreboard.querySelector('.record-name').textContent = best.name;
      const recordFlag = scoreboard.querySelector('.record-flag');
      recordFlag.textContent = countryFlag(best.country);
      recordFlag.setAttribute('aria-label', COUNTRIES.find(country => country.code === best.country)?.name || best.country);
      const last = shots.at(-1);
      scoreboard.querySelector('#play-shot-result').textContent = round.inFlight ? 'Ball in play. Follow the bounces.'
        : last ? `${last.bounces} pin hits × ${last.multiplier} = +${last.points} points` : 'Set your strength. Make every bounce count.';
    },
    finish(round, best) {
      const beaten = round.score > best.score;
      dialog.querySelector('#round-title').textContent = beaten ? 'A new high score.' : 'That’s a round.';
      dialog.querySelector('#round-description').textContent = beaten ? `You beat ${best.name}’s ${best.score.toLocaleString()} points. Leave your name on the board.`
        : `The score to beat is ${best.score.toLocaleString()}. Ten more balls could change everything.`;
      dialog.querySelector('#round-score').textContent = round.score.toLocaleString();
      dialog.querySelector('.round-breakdown').textContent = `10 balls · ${round.shots.reduce((sum, shot) => sum + shot.bounces, 0)} pin hits`;
      form.reset();
      nameInput.setCustomValidity('');
      countryInput.setCustomValidity('');
      selectedCountry = null;
      flag.textContent = '🌐';
      flag.setAttribute('aria-label', 'Choose a country');
      closeCountries();
      form.hidden = !beaten;
      dialog.querySelector('.record-saved').hidden = true;
      if (!dialog.open) dialog.showModal();
      if (beaten) nameInput.focus({ preventScroll: true });
      else dialog.querySelector('[data-round-replay]').focus({ preventScroll: true });
    },
    closeDialog,
    dispose() { closeDialog(); modeButton.removeEventListener('click', onToggle); rack.remove(); power.remove(); scoreboard.remove(); dialog.remove(); },
  };
}
