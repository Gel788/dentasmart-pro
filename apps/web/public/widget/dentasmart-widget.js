(function () {
  var script = document.currentScript;
  var clinic = (script && script.dataset.clinic) || 'demo-clinic';
  var apiBase = (script && script.dataset.api) || 'http://localhost:4000/api/v1';

  class DentaSmartBooking extends HTMLElement {
    constructor() {
      super();
      this.branchId = '';
    }

    connectedCallback() {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = '<p style="font-family:system-ui;padding:16px">Загрузка записи…</p>';
      this.load();
    }

    async load() {
      try {
        var config = await fetch(apiBase + '/public/widget/' + clinic + '/config').then(function (r) { return r.json(); });
        var services = await fetch(apiBase + '/public/widget/' + clinic + '/services').then(function (r) { return r.json(); });
        this.branchId = (config.branches && config.branches[0] && config.branches[0].id) || '';
        this.services = Array.isArray(services) ? services : [];
        this.render(config, this.services);
      } catch (e) {
        this.shadowRoot.innerHTML = '<p style="font-family:system-ui;padding:16px">Не удалось загрузить виджет</p>';
      }
    }

    render(config, services) {
      var color = (config.config && config.config.primaryColor) || '#0f9d8a';
      var name = (config.organization && config.organization.name) || 'Запись онлайн';
      var list = services.map(function (s) {
        return '<option value="' + s.id + '">' + s.name + '</option>';
      }).join('');
      this.shadowRoot.innerHTML =
        '<style>:host{font-family:system-ui;display:block;max-width:420px}.card{border:1px solid #d5e4e8;border-radius:12px;padding:16px}h3{margin:0 0 12px;color:' + color + '}label{display:block;font-size:12px;margin-bottom:4px;color:#5d7680}input,select{width:100%;margin-bottom:10px;padding:8px;border-radius:8px;border:1px solid #d5e4e8;box-sizing:border-box}button{width:100%;padding:10px;background:' + color + ';color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600}</style>' +
        '<div class="card"><h3>' + name + '</h3><label>Услуга</label><select id="svc">' + list + '</select><label>Свободное кресло</label><select id="slot"><option value="">Загрузка…</option></select><label>Имя</label><input id="fn" placeholder="Имя" /><label>Фамилия</label><input id="ln" placeholder="Фамилия" /><label>Телефон</label><input id="ph" placeholder="+7..." /><button id="book" type="button">Записаться</button><p id="msg" style="font-size:12px;margin-top:8px;color:#5d7680"></p></div>';
      var self = this;
      this.shadowRoot.getElementById('svc').addEventListener('change', function () { self.loadSlots(); });
      this.shadowRoot.getElementById('book').addEventListener('click', function () { self.book(); });
      this.loadSlots();
    }

    async loadSlots() {
      var root = this.shadowRoot;
      var select = root.getElementById('slot');
      var service = (this.services || []).find(function (row) { return row.id === root.getElementById('svc').value; });
      var duration = (service && service.durationMin) || 30;
      var from = new Date();
      var to = new Date();
      to.setDate(to.getDate() + 5);
      try {
        var url = apiBase + '/public/widget/' + clinic + '/slots?branchId=' + encodeURIComponent(this.branchId) + '&from=' + encodeURIComponent(from.toISOString()) + '&to=' + encodeURIComponent(to.toISOString()) + '&durationMin=' + duration;
        var slots = await fetch(url).then(function (r) { return r.json(); });
        this.slots = Array.isArray(slots) ? slots : [];
        select.innerHTML = this.slots.length
          ? this.slots.map(function (slot, index) {
              return '<option value="' + index + '">' + new Date(slot.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</option>';
            }).join('')
          : '<option value="">Свободных кресел нет</option>';
      } catch (e) {
        select.innerHTML = '<option value="">Не удалось загрузить время</option>';
      }
    }

    async book() {
      var root = this.shadowRoot;
      var msg = root.getElementById('msg');
      var slot = (this.slots || [])[Number(root.getElementById('slot').value)];
      if (!slot) {
        msg.textContent = 'Выберите свободное время';
        return;
      }
      msg.textContent = 'Отправка…';
      try {
        var response = await fetch(apiBase + '/public/widget/' + clinic + '/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: this.branchId,
            serviceId: root.getElementById('svc').value,
            firstName: root.getElementById('fn').value,
            lastName: root.getElementById('ln').value,
            phone: root.getElementById('ph').value,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          }),
        });
        var body = await response.json().catch(function () { return {}; });
        msg.textContent = response.ok ? 'Заявка принята. Клиника подтвердит время.' : (body.message || 'Ошибка записи');
      } catch (e) {
        msg.textContent = 'Ошибка записи';
      }
    }
  }

  if (!customElements.get('dentasmart-booking')) {
    customElements.define('dentasmart-booking', DentaSmartBooking);
  }
  var mount = document.createElement('dentasmart-booking');
  if (script && script.parentElement) script.parentElement.insertBefore(mount, script.nextSibling);
})();
