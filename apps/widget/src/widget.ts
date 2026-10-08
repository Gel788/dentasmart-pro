(function () {
  const script = document.currentScript as HTMLScriptElement | null;
  const clinic = script?.dataset.clinic ?? 'demo-clinic';
  const apiBase = script?.dataset.api ?? 'http://localhost:4000/api/v1';

  class DentaSmartBooking extends HTMLElement {
    branchId = '';

    connectedCallback() {
      this.attachShadow({ mode: 'open' });
      this.renderLoading();
      this.load();
    }

    async load() {
      try {
        const [config, services] = await Promise.all([
          fetch(`${apiBase}/public/widget/${clinic}/config`).then((r) => r.json()),
          fetch(`${apiBase}/public/widget/${clinic}/services`).then((r) => r.json()),
        ]);
        this.branchId = config.branches?.[0]?.id ?? '';
        this.render(config, services);
      } catch {
        this.renderError();
      }
    }

    renderLoading() {
      if (!this.shadowRoot) return;
      this.shadowRoot.innerHTML = `<style>:host{font-family:system-ui;display:block;padding:16px;border:1px solid #ddd;border-radius:12px;max-width:400px}</style><p>Загрузка записи…</p>`;
    }

    renderError() {
      if (!this.shadowRoot) return;
      this.shadowRoot.innerHTML = `<style>:host{font-family:system-ui;display:block;padding:16px;border:1px solid #f87171;border-radius:12px}</style><p>Не удалось загрузить виджет</p>`;
    }

    render(config: { organization: { name: string }; branches?: { id: string }[] }, services: { id: string; name: string; basePrice: string }[]) {
      if (!this.shadowRoot) return;
      const color = config?.config?.primaryColor ?? '#3b9eff';
      const list = services
        .map((s) => `<option value="${s.id}">${s.name} — ${s.basePrice} ₽</option>`)
        .join('');
      this.shadowRoot.innerHTML = `
        <style>
          :host { font-family: system-ui; display: block; max-width: 420px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
          h3 { margin: 0 0 12px; color: ${color}; }
          label { display: block; font-size: 12px; margin-bottom: 4px; color: #666; }
          input, select { width: 100%; margin-bottom: 10px; padding: 8px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; }
          button { width: 100%; padding: 10px; background: ${color}; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
        </style>
        <div class="card">
          <h3>${config.organization?.name ?? 'Запись онлайн'}</h3>
          <label>Услуга</label>
          <select id="svc">${list}</select>
          <label>Имя</label>
          <input id="fn" placeholder="Имя" />
          <label>Фамилия</label>
          <input id="ln" placeholder="Фамилия" />
          <label>Телефон</label>
          <input id="ph" placeholder="+7..." />
          <button id="book">Записаться</button>
          <p id="msg" style="font-size:12px;margin-top:8px;color:#666"></p>
        </div>
      `;
      this.shadowRoot.getElementById('book')?.addEventListener('click', () => this.book());
    }

    async book() {
      const root = this.shadowRoot!;
      const msg = root.getElementById('msg')!;
      msg.textContent = 'Отправка…';
      const starts = new Date();
      starts.setDate(starts.getDate() + 2);
      starts.setHours(11, 0, 0, 0);
      const ends = new Date(starts);
      ends.setMinutes(30);
      try {
        await fetch(`${apiBase}/public/widget/${clinic}/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: this.branchId,
            serviceId: (root.getElementById('svc') as HTMLSelectElement).value,
            firstName: (root.getElementById('fn') as HTMLInputElement).value,
            lastName: (root.getElementById('ln') as HTMLInputElement).value,
            phone: (root.getElementById('ph') as HTMLInputElement).value,
            startsAt: starts.toISOString(),
            endsAt: ends.toISOString(),
          }),
        });
        msg.textContent = 'Заявка принята! Мы свяжемся для подтверждения.';
      } catch {
        msg.textContent = 'Ошибка записи';
      }
    }
  }

  if (!customElements.get('dentasmart-booking')) {
    customElements.define('dentasmart-booking', DentaSmartBooking);
  }

  const mount = document.createElement('dentasmart-booking');
  if (script?.parentElement) {
    script.parentElement.insertBefore(mount, script.nextSibling);
  }
})();
