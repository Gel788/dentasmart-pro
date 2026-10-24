/*
 * DentaSmart booking widget for a clinic's site.
 *   <script src="https://…/widget/dentasmart-widget.js" data-clinic="slug" data-api="https://…/api/v1"></script>
 *   <dentasmart-booking></dentasmart-booking>
 * A patient either tells the assistant what bothers them or picks a time themselves; either way the
 * clinic gets a request to confirm. Names and phones go only through the form, never into the chat.
 */
(function () {
  var script = document.currentScript;
  var clinic = (script && script.dataset.clinic) || 'demo-clinic';
  var apiBase = ((script && script.dataset.api) || 'http://localhost:4000/api/v1').replace(/\/$/, '');
  var base = apiBase + '/public/widget/' + encodeURIComponent(clinic);

  var CSS = [
    ':host{--accent:#1f4ed8;--ink:#15191e;--ink2:#424a54;--muted:#646c76;--line:#dadde1;--paper:#f2f3f5;--white:#fff;--warn:#c65410;--bad:#b01a51;display:block;font-family:Onest,"Golos Text",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);font-size:15px;line-height:1.45}',
    '*{box-sizing:border-box}',
    '.w{max-width:520px;margin:0 auto;background:var(--white);border:1px solid var(--line);display:flex;flex-direction:column;min-height:420px}',
    '.top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}',
    '.mark{width:32px;height:32px;display:grid;place-items:center;background:var(--ink);color:#fff;font-weight:800;position:relative;flex:none}',
    '.mark:after{content:"";position:absolute;top:3px;right:3px;width:7px;height:7px;background:var(--accent)}',
    '.top b{display:block;font-weight:800}.top small{display:block;color:var(--muted);font-size:12.5px}',
    '.back{margin-left:auto;min-height:40px;padding:0 10px;border:0;background:none;color:var(--accent);font:inherit;font-weight:600;cursor:pointer}',
    '.body{flex:1;padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;max-height:70vh}',
    'h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.01em;line-height:1.2}',
    'p{margin:0}.muted{color:var(--muted);font-size:13.5px}',
    '.choice{display:flex;flex-direction:column;gap:8px}',
    '.big{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;min-height:64px;padding:12px 14px;border:1px solid var(--ink);background:var(--white);color:var(--ink);font:inherit;text-align:left;cursor:pointer}',
    '.big b{font-weight:700;font-size:16px}.big span{color:var(--muted);font-size:13.5px}',
    '.big.main{background:var(--accent);border-color:var(--accent);color:#fff}.big.main span{color:#dfe6ff}',
    '.big:hover{filter:brightness(.97)}',
    '.log{display:flex;flex-direction:column;gap:8px}',
    '.msg{max-width:88%;padding:9px 12px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.msg.me{align-self:flex-end;background:var(--ink);color:#fff}',
    '.msg.bot{align-self:flex-start;background:var(--paper)}',
    '.msg.err{align-self:stretch;background:#fce8ef;color:var(--bad);font-weight:600}',
    '.urgent{padding:9px 12px;border:1px solid var(--warn);color:var(--warn);font-weight:700;font-size:14px}',
    '.typing{align-self:flex-start;color:var(--muted);font-size:13.5px}',
    '.slots{display:flex;flex-direction:column;gap:8px}',
    '.day{font-size:13px;font-weight:700;color:var(--ink2);margin-top:4px}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.chip{min-height:44px;min-width:76px;padding:0 12px;border:1px solid var(--line);background:var(--white);color:var(--ink);font:inherit;font-weight:600;font-variant-numeric:tabular-nums;cursor:pointer}',
    '.chip:hover{border-color:var(--ink)}.chip[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}',
    '.svc{display:flex;flex-direction:column;border:1px solid var(--line)}',
    '.svc button{display:flex;justify-content:space-between;gap:12px;min-height:52px;padding:8px 12px;border:0;border-bottom:1px solid var(--line);background:var(--white);font:inherit;text-align:left;cursor:pointer;color:var(--ink)}',
    '.svc button:last-child{border-bottom:0}.svc button span{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.svc button[aria-pressed=true]{background:#eef2fd}',
    '.foot{border-top:1px solid var(--line);padding:12px 16px;display:flex;flex-direction:column;gap:8px}',
    '.row{display:flex;gap:8px}',
    'textarea,input[type=text],input[type=tel]{width:100%;min-height:48px;padding:10px 12px;border:1px solid var(--ink);background:var(--white);color:var(--ink);font:inherit;font-size:16px;resize:none}',
    'textarea:focus,input:focus{outline:0;box-shadow:inset 0 0 0 1px var(--ink)}',
    'label.f{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--ink2)}',
    '.check{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--ink2);cursor:pointer}',
    '.check input{width:20px;height:20px;flex:none;margin:1px 0 0;accent-color:var(--accent)}',
    '.send{flex:none;min-width:48px;min-height:48px;padding:0 16px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:700;cursor:pointer}',
    '.submit{min-height:52px;border:0;background:var(--accent);color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer}',
    'button:disabled{opacity:.55;cursor:default}',
    'button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.done{align-items:flex-start}.ok{width:44px;height:44px;display:grid;place-items:center;background:#0b8a5f;color:#fff;font-size:24px;font-weight:800}',
    '.when{font-size:28px;font-weight:300;letter-spacing:-.02em;font-variant-numeric:tabular-nums}'
  ].join('');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'on') Object.keys(attrs.on).forEach(function (ev) { node.addEventListener(ev, attrs.on[ev]); });
      else if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== false) node.setAttribute(key, attrs[key] === true ? '' : attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function json(url, body) {
    return fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { if (!r.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : (data.message || 'Не получилось, попробуйте ещё раз')); return data; }); });
  }
  function dayLabel(iso) { return new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function timeLabel(iso) { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
  function money(value) { return Math.round(Number(value) || 0).toLocaleString('ru-RU') + ' ₽'; }

  class DentaSmartBooking extends HTMLElement {
    connectedCallback() {
      this.root = this.attachShadow({ mode: 'open' });
      this.state = { step: 'start', log: [], chatId: null, slots: [], service: null, slot: null, consent: false, urgent: false, pending: false, assistant: false, services: [], branchId: '', clinicName: '' };
      this.paint(el('p', { class: 'muted', text: 'Загрузка записи…' }));
      var self = this;
      Promise.all([json(base + '/config'), json(base + '/services').catch(function () { return []; }), json(base + '/assistant').catch(function () { return { enabled: false }; })])
        .then(function (res) {
          var config = res[0];
          self.state.clinicName = (config.organization && config.organization.name) || 'Клиника';
          self.state.branchId = (config.branches && config.branches[0] && config.branches[0].id) || '';
          self.state.services = Array.isArray(res[1]) ? res[1] : [];
          self.state.assistant = !!res[2].enabled;
          if (config.config && config.config.primaryColor && /^#[0-9a-f]{6}$/i.test(config.config.primaryColor) && config.config.primaryColor !== '#3b9eff') self.style.setProperty('--accent', config.config.primaryColor);
          self.render();
        })
        .catch(function () { self.paint(el('p', { class: 'msg err', text: 'Не удалось загрузить запись. Позвоните в клинику.' })); });
    }

    go(step) { this.state.step = step; this.render(); }

    paint(body, foot, back) {
      var self = this;
      var top = el('div', { class: 'top' }, [
        el('span', { class: 'mark', 'aria-hidden': 'true', text: (this.state.clinicName || 'С').charAt(0) }),
        el('span', null, [el('b', { text: this.state.clinicName || 'Запись' }), el('small', { text: 'Онлайн-запись' })]),
        back ? el('button', { class: 'back', type: 'button', text: '← Назад', on: { click: function () { self.go(back); } } }) : null,
      ]);
      var wrap = el('section', { class: 'w', 'aria-label': 'Запись на приём' }, [top, el('div', { class: 'body' }, [body]), foot || null]);
      this.root.innerHTML = '';
      this.root.appendChild(el('style', { text: CSS }));
      this.root.appendChild(wrap);
      var scroller = this.root.querySelector('.body');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }

    render() {
      var s = this.state;
      if (s.step === 'start') return this.renderStart();
      if (s.step === 'chat') return this.renderChat();
      if (s.step === 'pick') return this.renderPick();
      if (s.step === 'form') return this.renderForm();
      if (s.step === 'done') return this.renderDone();
    }

    renderStart() {
      var self = this;
      var options = [];
      if (this.state.assistant) options.push(el('button', { class: 'big main', type: 'button', on: { click: function () { self.go('chat'); } } }, [el('b', { text: 'Расскажите, что беспокоит' }), el('span', { text: 'Помощник подберёт услугу и свободное время' })]));
      options.push(el('button', { class: 'big', type: 'button', on: { click: function () { self.go('pick'); } } }, [el('b', { text: 'Выбрать услугу и время самому' }), el('span', { text: 'Прайс и свободные окна' })]));
      this.paint(el('div', { class: 'choice' }, [el('h2', { text: 'Запись на приём' }), el('p', { class: 'muted', text: 'Клиника подтвердит запись и свяжется с вами.' })].concat(options)));
    }

    renderChat() {
      var self = this;
      var s = this.state;
      var log = el('div', { class: 'log', 'aria-live': 'polite' });
      if (!s.log.length) log.appendChild(el('div', { class: 'msg bot', text: 'Здравствуйте! Опишите, что беспокоит или с чем хотите прийти — подберу услугу и время.' }));
      s.log.forEach(function (item) { log.appendChild(el('div', { class: 'msg ' + item.who, text: item.text })); });
      if (s.urgent) log.appendChild(el('div', { class: 'urgent', text: 'Похоже на срочный случай — выберите ближайшее время. При угрозе жизни звоните 103 или 112.' }));
      if (s.pending) log.appendChild(el('div', { class: 'typing', text: 'Помощник печатает…' }));
      var parts = [log];
      if (s.slots.length) parts.push(this.slotPicker(s.slots));
      var input = el('textarea', { rows: '1', maxlength: '1000', placeholder: 'Например: болит зуб слева, удобно вечером', 'aria-label': 'Сообщение помощнику' });
      var send = function () {
        var text = input.value.trim();
        if (!text || s.pending) return;
        if (!s.chatId && !s.consent) { s.log.push({ who: 'err', text: 'Отметьте согласие ниже, чтобы начать.' }); self.render(); return; }
        s.log.push({ who: 'me', text: text });
        s.pending = true;
        self.render();
        json(base + '/assistant', { chatId: s.chatId || undefined, message: text, consent: s.consent })
          .then(function (data) {
            s.chatId = data.chatId;
            s.log.push({ who: 'bot', text: data.reply });
            s.slots = data.slots || [];
            s.service = data.service || s.service;
            s.urgent = !!data.urgent;
          })
          .catch(function (err) { s.log.push({ who: 'err', text: err.message }); })
          .then(function () { s.pending = false; self.render(); var box = self.root.querySelector('textarea'); if (box) box.focus(); });
      };
      input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } });
      var foot = el('div', { class: 'foot' }, [
        !s.chatId ? el('label', { class: 'check' }, [
          el('input', { type: 'checkbox', checked: s.consent, on: { change: function (event) { s.consent = event.target.checked; } } }),
          el('span', { text: 'Согласен(на), что мои сообщения обработает ИИ-помощник (сервис Polza AI, модель работает на зарубежных серверах) для подбора услуги и времени. Не пишите в чат ФИО, телефон и паспортные данные — их спросим в форме.' }),
        ]) : null,
        el('div', { class: 'row' }, [input, el('button', { class: 'send', type: 'button', disabled: s.pending, 'aria-label': 'Отправить', text: '→', on: { click: send } })]),
      ]);
      this.paint(el('div', { class: 'log-wrap' }, parts), foot, 'start');
    }

    slotPicker(slots) {
      var self = this;
      var box = el('div', { class: 'slots' }, [el('p', { class: 'muted', text: 'Свободное время:' })]);
      var byDay = {};
      slots.forEach(function (slot) { var key = dayLabel(slot.startsAt); (byDay[key] = byDay[key] || []).push(slot); });
      Object.keys(byDay).forEach(function (day) {
        box.appendChild(el('div', { class: 'day', text: day.charAt(0).toUpperCase() + day.slice(1) }));
        box.appendChild(el('div', { class: 'chips' }, byDay[day].map(function (slot) {
          return el('button', { class: 'chip', type: 'button', text: timeLabel(slot.startsAt), on: { click: function () { self.state.slot = slot; self.go('form'); } } });
        })));
      });
      return box;
    }

    renderPick() {
      var self = this;
      var s = this.state;
      var list = el('div', { class: 'svc', role: 'list' }, s.services.map(function (svc) {
        return el('button', { type: 'button', 'aria-pressed': s.service && s.service.id === svc.id ? 'true' : 'false', on: { click: function () { s.service = { id: svc.id, name: svc.name, price: Number(svc.basePrice), durationMin: svc.durationMin }; s.slots = []; self.render(); self.loadSlots(); } } }, [
          el('b', { text: svc.name }), el('span', { text: (svc.durationMin || 30) + ' мин · ' + money(svc.basePrice) }),
        ]);
      }));
      var parts = [el('h2', { text: 'Услуга и время' }), s.services.length ? list : el('p', { class: 'muted', text: 'Прайс пока пуст — выберите время, клиника уточнит услугу.' })];
      if (s.service || !s.services.length) {
        if (s.loading) parts.push(el('p', { class: 'muted', text: 'Ищем свободное время…' }));
        else if (s.slots.length) parts.push(this.slotPicker(s.slots));
        else if (s.loaded) parts.push(el('p', { class: 'muted', text: 'На ближайшие две недели свободного времени нет. Позвоните в клинику.' }));
      }
      this.paint(el('div', { class: 'choice' }, parts), null, 'start');
      if (!s.services.length && !s.loaded && !s.loading) this.loadSlots();
    }

    loadSlots() {
      var self = this;
      var s = this.state;
      s.loading = true; s.loaded = false;
      var from = new Date(); var to = new Date(Date.now() + 14 * 86400000);
      json(base + '/slots?branchId=' + encodeURIComponent(s.branchId) + '&from=' + from.toISOString() + '&to=' + to.toISOString() + '&durationMin=' + ((s.service && s.service.durationMin) || 30))
        .then(function (rows) { s.slots = Array.isArray(rows) ? rows : []; })
        .catch(function () { s.slots = []; })
        .then(function () { s.loading = false; s.loaded = true; self.render(); });
    }

    renderForm() {
      var self = this;
      var s = this.state;
      var last = el('input', { type: 'text', autocomplete: 'family-name', required: true, maxlength: '80' });
      var first = el('input', { type: 'text', autocomplete: 'given-name', required: true, maxlength: '80' });
      var phone = el('input', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', required: true, placeholder: '+7 900 000-00-00' });
      var agree = el('input', { type: 'checkbox' });
      var error = el('p', { class: 'msg err', role: 'alert', hidden: true });
      var submit = el('button', { class: 'submit', type: 'submit', text: 'Отправить заявку' });
      var form = el('form', { class: 'choice', on: { submit: function (event) {
        event.preventDefault();
        if (!agree.checked) { error.textContent = 'Нужно согласие на обработку персональных данных.'; error.hidden = false; return; }
        submit.disabled = true; submit.textContent = 'Отправляем…';
        json(base + '/book', { branchId: s.branchId, serviceId: (s.service && s.service.id) || undefined, startsAt: s.slot.startsAt, endsAt: s.slot.endsAt, firstName: first.value.trim(), lastName: last.value.trim(), phone: phone.value.trim(), consent: true, chatId: s.chatId || undefined })
          .then(function () { self.go('done'); })
          .catch(function (err) { error.textContent = err.message; error.hidden = false; submit.disabled = false; submit.textContent = 'Отправить заявку'; });
      } } }, [
        el('h2', { text: 'Ваши данные' }),
        el('p', null, [el('span', { class: 'when', text: timeLabel(s.slot.startsAt) }), ' ', el('span', { class: 'muted', text: dayLabel(s.slot.startsAt) + (s.service ? ' · ' + s.service.name : '') })]),
        el('label', { class: 'f' }, ['Фамилия', last]),
        el('label', { class: 'f' }, ['Имя', first]),
        el('label', { class: 'f' }, ['Телефон', phone]),
        el('label', { class: 'check' }, [agree, el('span', { text: 'Согласен(на) на обработку персональных данных клиникой для записи на приём (152-ФЗ).' })]),
        error,
        submit,
      ]);
      this.paint(form, null, s.chatId ? 'chat' : 'pick');
    }

    renderDone() {
      var s = this.state;
      this.paint(el('div', { class: 'choice done', role: 'status' }, [
        el('span', { class: 'ok', 'aria-hidden': 'true', text: '✓' }),
        el('h2', { text: 'Заявка отправлена' }),
        el('p', null, [el('span', { class: 'when', text: timeLabel(s.slot.startsAt) }), ' ', el('span', { class: 'muted', text: dayLabel(s.slot.startsAt) })]),
        el('p', { class: 'muted', text: 'Время закреплено за вами. Администратор подтвердит запись и позвонит, если что-то нужно уточнить.' }),
      ]));
    }
  }

  if (!customElements.get('dentasmart-booking')) customElements.define('dentasmart-booking', DentaSmartBooking);
  if (!document.querySelector('dentasmart-booking') && script && script.dataset.mount !== 'manual') {
    script.insertAdjacentElement('afterend', document.createElement('dentasmart-booking'));
  }
})();
