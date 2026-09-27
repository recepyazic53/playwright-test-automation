// Ayarlar > Proje ve ortamlar > "Servis taban adresleri": tüm servislerin ortam başına taban adresleri tek tabloda
// (satır = servis, sütun = ortam). Toplu düzenleme: hücre, bul-değiştir (seçili ortamda / seçili satırlarda), çoklu seçimle
// atama ve adlandırılmış taban adres (aynı sunucuyu paylaşan servisler tek ada bağlanır; bir hücre değişince bağlı tümü değişir).
// Değişiklikler önce tarayıcıda taslaktır; "Etkiyi göster" hangi servislerin, kaç senaryo / akışın etkileneceğini ve eski → yeni
// adresleri listeler; YALNIZ "Onayla ve kaydet" ile yazılır. Hiçbir servise istek atılmaz (erişim kontrolü servis sayfasından).
import { adresGecerliMi, alan, api, bildir, h, ikon, iskelet, mesajKutusu, mesgulIken, rozet, yeniKimlik, yerlestir } from './ortak.js';

const MOD_ETIKETI = { ortam: 'Ortamın adresi', yok: 'Bu ortamda yok', servis: 'Özel adres' };
const temiz = (a) => String(a || '').trim().replace(/\/+$/, '');

/** @param {{ id: string; ad: string }} proje @returns {HTMLElement} */
export function tabanAdresleriBolumu(proje) {
  const kap = h('section', { class: 'taban-adresleri', 'aria-labelledby': 'taban-adresleri-basligi' }, iskelet('liste'));
  yukle(kap, proje).catch((e) => { if (!e || e.durum !== 423) yerlestir(kap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e))); });
  return kap;
}

async function yukle(kap, proje) {
  const veri = await api(`/platform/servis-tabanlari?projeId=${encodeURIComponent(proje.id)}`);
  const { ortamlar, satirlar } = veri;
  const baslik = h('div', { class: 'bolum-basligi' }, h('h3', { id: 'taban-adresleri-basligi' }, 'Servis taban adresleri', rozet(String(satirlar.length))));
  if (!satirlar.length) {
    yerlestir(kap, baslik, h('p', { class: 'soluk kucuk' }, 'Henüz servis yok. Servis eklenince taban adresleri burada toplu düzenlenir.'));
    return;
  }
  /** Özgün ve taslak hücreler: servisId → { grup, hucreler: { ortamId: { mod, deger } } }. */
  const kopya = (s) => ({ grup: s.grup || '', hucreler: Object.fromEntries(ortamlar.map((o) => {
    const x = s.tabanlar[o.id];
    return [o.id, { mod: x.kaynak, deger: x.kaynak === 'servis' || x.kaynak === 'eski' ? x.deger : '' }];
  })) });
  const ozgun = new Map(satirlar.map((s) => [s.servisId, kopya(s)]));
  const taslak = new Map(satirlar.map((s) => [s.servisId, kopya(s)]));
  const secili = new Set();
  const mesaj = mesajKutusu();
  const tabloKap = h('div', { class: 'tablo-kaydirma' });
  const etkiKap = h('div', { 'aria-live': 'polite' });
  const durumMetni = h('span', { class: 'soluk kucuk', 'aria-live': 'polite' });
  const gruplar = () => [...new Set([...taslak.values()].map((t) => t.grup).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const grupListesi = h('datalist', { id: yeniKimlik('taban-gruplari') });

  /** Hücre değişince: satır bir ada bağlıysa aynı addaki tüm servislere uygulanır. */
  const hucreAta = (servisId, ortamId, hucre) => {
    const t = taslak.get(servisId);
    const hedefler = t.grup ? [...taslak.entries()].filter(([, x]) => x.grup === t.grup).map(([id]) => id) : [servisId];
    for (const id of hedefler) {
      const x = taslak.get(id);
      if (x.hucreler[ortamId].mod === 'eski') continue;
      x.hucreler[ortamId] = { ...hucre };
    }
  };
  /** Ada bağlama: adın başka üyesi varsa onun adresleri bu servise kopyalanır (addaki servislerin adresleri aynıdır). */
  const grupAta = (servisId, ad) => {
    const t = taslak.get(servisId);
    t.grup = ad.trim();
    const uye = t.grup ? [...taslak.entries()].find(([id, x]) => id !== servisId && x.grup === t.grup) : null;
    if (uye) for (const o of ortamlar) if (t.hucreler[o.id].mod !== 'eski') t.hucreler[o.id] = { ...uye[1].hucreler[o.id] };
  };

  const degisiklikler = () => {
    const d = {};
    for (const s of satirlar) {
      const o0 = ozgun.get(s.servisId);
      const t = taslak.get(s.servisId);
      const tabanlar = {};
      for (const o of ortamlar) {
        const a = o0.hucreler[o.id];
        const b = t.hucreler[o.id];
        if (a.mod === b.mod && temiz(a.deger) === temiz(b.deger)) continue;
        tabanlar[o.id] = b.mod === 'servis' ? temiz(b.deger) : b.mod === 'yok' ? '' : null;
      }
      const grupDegisti = (o0.grup || '') !== (t.grup || '');
      if (Object.keys(tabanlar).length || grupDegisti) d[s.servisId] = { ...(Object.keys(tabanlar).length ? { tabanlar } : {}), ...(grupDegisti ? { grup: t.grup || null } : {}) };
    }
    return d;
  };
  const durumGuncelle = () => {
    const n = Object.keys(degisiklikler()).length;
    durumMetni.textContent = n ? `${n} serviste kaydedilmemiş değişiklik var.` : 'Değişiklik yok.';
    etkiGoster.disabled = !n;
    geriAl.disabled = !n;
  };

  const hucre = (s, o) => {
    const t = taslak.get(s.servisId);
    const x = t.hucreler[o.id];
    if (x.mod === 'eski') {
      return h('td', {}, h('code', { class: 'duz', title: 'Eski tam adres ayarı (servis sayfasında İşlemler > Taban adresler ile değiştirilir)' }, x.deger), ' ', rozet('tam adres', 'durdu'));
    }
    const etiket = `${s.ad} · ${o.ad}`;
    const mod = h('select', { 'aria-label': `${etiket}: adres türü` },
      Object.entries(MOD_ETIKETI).map(([m, e]) => h('option', { value: m, selected: x.mod === m }, m === 'ortam' ? `${e} (${temiz(o.tabanUrl)})` : e)));
    const girdi = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', value: x.deger, placeholder: 'https://', hidden: x.mod !== 'servis', 'aria-label': `${etiket}: taban adres`,
      list: o.tabanAdresleri.length ? `${grupListesi.id}-${o.id}` : null });
    const degisti = () => { const a = ozgun.get(s.servisId).hucreler[o.id]; const b = taslak.get(s.servisId).hucreler[o.id]; return a.mod !== b.mod || temiz(a.deger) !== temiz(b.deger); };
    mod.addEventListener('change', () => { hucreAta(s.servisId, o.id, { mod: mod.value, deger: mod.value === 'servis' ? (x.deger || temiz(o.tabanUrl)) : '' }); ciz(); });
    girdi.addEventListener('change', () => { hucreAta(s.servisId, o.id, { mod: 'servis', deger: girdi.value.trim() }); ciz(); });
    return h('td', { class: degisti() ? 'degisti' : null }, h('div', { class: 'taban-hucresi' }, mod, girdi),
      x.mod === 'servis' && x.deger && !adresGecerliMi(x.deger) ? h('div', { class: 'alan-hatasi', role: 'alert' }, 'http:// ya da https:// ile başlamalı') : null);
  };

  const hepsi = h('input', { type: 'checkbox', 'aria-label': 'Tüm servisleri seç' });
  hepsi.addEventListener('change', () => { for (const s of satirlar) if (hepsi.checked) secili.add(s.servisId); else secili.delete(s.servisId); ciz(); });

  const ciz = () => {
    yerlestir(grupListesi, gruplar().map((g) => h('option', { value: g })));
    const sirali = [...satirlar].sort((a, b) => (taslak.get(a.servisId).grup || '￿').localeCompare(taslak.get(b.servisId).grup || '￿', 'tr') || a.ad.localeCompare(b.ad, 'tr'));
    hepsi.checked = secili.size === satirlar.length;
    yerlestir(tabloKap, h('table', { class: 'ozet-tablosu taban-tablosu', 'aria-label': 'Servis taban adresleri' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, hepsi), h('th', { scope: 'col' }, 'Servis'), h('th', { scope: 'col' }, 'Taban adres adı'),
        ortamlar.map((o) => h('th', { scope: 'col' }, o.ad, ' ', rozet(o.canli ? 'CANLI' : 'TEST', o.canli ? 'hata' : ''))))),
      h('tbody', {}, sirali.map((s) => {
        const t = taslak.get(s.servisId);
        const sec = h('input', { type: 'checkbox', checked: secili.has(s.servisId), 'aria-label': `${s.ad} seç` });
        sec.addEventListener('change', () => { if (sec.checked) secili.add(s.servisId); else secili.delete(s.servisId); hepsi.checked = secili.size === satirlar.length; });
        const grup = h('input', { type: 'text', autocomplete: 'off', value: t.grup, maxlength: '60', placeholder: 'ad yok', list: grupListesi.id, 'aria-label': `${s.ad}: taban adres adı` });
        grup.addEventListener('change', () => { grupAta(s.servisId, grup.value); ciz(); });
        return h('tr', {},
          h('td', {}, sec),
          h('th', { scope: 'row' }, s.ad, ' ', rozet(s.tur === 'rest' ? 'REST' : 'SOAP', 'vurgu'),
            h('div', { class: 'soluk kucuk' }, h('code', { class: 'duz' }, s.yol || '—'), ` · ${s.senaryoSayisi} senaryo${s.akislar.length ? ` · ${s.akislar.length} akış` : ''}`)),
          h('td', { class: (ozgun.get(s.servisId).grup || '') !== (t.grup || '') ? 'degisti' : null }, grup),
          ortamlar.map((o) => hucre(s, o)));
      }))),
      ortamlar.map((o) => h('datalist', { id: `${grupListesi.id}-${o.id}` }, o.tabanAdresleri.map((a) => h('option', { value: temiz(a) })))));
    yerlestir(etkiKap);
    durumGuncelle();
  };

  // --- Toplu işlemler -------------------------------------------------------------------------------------------------
  const ortamSecimi = (etiket, tumu) => h('select', { 'aria-label': etiket }, tumu ? h('option', { value: '' }, 'Tüm ortamlar') : null, ortamlar.map((o) => h('option', { value: o.id }, o.ad)));
  const hedefServisler = () => (secili.size ? satirlar.filter((s) => secili.has(s.servisId)) : satirlar);

  const bulOrtam = ortamSecimi('Bul-değiştir ortamı', true);
  const bul = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'eski.ornek.com' });
  const yeni = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'yeni.ornek.com' });
  const degistir = h('button', { type: 'button' }, 'Değiştir');
  degistir.addEventListener('click', () => {
    mesaj.temizle();
    if (!bul.value) { mesaj.goster('Aranacak metni yazın.'); return; }
    let n = 0;
    for (const s of hedefServisler()) {
      for (const o of ortamlar) {
        if (bulOrtam.value && o.id !== bulOrtam.value) continue;
        const x = taslak.get(s.servisId).hucreler[o.id];
        // Ortamın adresini kullanan hücre de değişirse özel adrese döner (ortamın kendi adresi Ortamlar'dan değiştirilir).
        const mevcut = x.mod === 'servis' ? x.deger : x.mod === 'ortam' ? temiz(o.tabanUrl) : '';
        if (!mevcut.includes(bul.value)) continue;
        hucreAta(s.servisId, o.id, { mod: 'servis', deger: mevcut.split(bul.value).join(yeni.value) });
        n++;
      }
    }
    ciz();
    bildir(n ? `${n} hücrede değiştirildi (henüz kaydedilmedi).` : 'Eşleşen adres yok.');
  });

  const atamaOrtami = ortamSecimi('Atanacak ortam', false);
  const atamaModu = h('select', { 'aria-label': 'Atanacak adres türü' }, Object.entries(MOD_ETIKETI).map(([m, e]) => h('option', { value: m, selected: m === 'servis' }, e)));
  const atamaAdresi = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://' });
  atamaModu.addEventListener('change', () => { atamaAdresi.hidden = atamaModu.value !== 'servis'; });
  const ata = h('button', { type: 'button' }, 'Seçilenlere ata');
  ata.addEventListener('click', () => {
    mesaj.temizle();
    if (!secili.size) { mesaj.goster('Önce tablodan servis seçin.'); return; }
    if (atamaModu.value === 'servis' && !adresGecerliMi(atamaAdresi.value.trim())) { mesaj.goster('Geçerli bir http(s) adresi yazın.'); return; }
    for (const id of secili) hucreAta(id, atamaOrtami.value, { mod: atamaModu.value, deger: atamaModu.value === 'servis' ? atamaAdresi.value.trim() : '' });
    ciz();
  });
  const grupAdi = h('input', { type: 'text', autocomplete: 'off', maxlength: '60', placeholder: 'ör. Çekirdek servisler' });
  grupAdi.setAttribute('list', grupListesi.id);
  const bagla = h('button', { type: 'button' }, 'Seçilenleri bu ada bağla');
  bagla.addEventListener('click', () => {
    mesaj.temizle();
    if (!secili.size) { mesaj.goster('Önce tablodan servis seçin.'); return; }
    const ad = grupAdi.value.trim();
    const ilk = [...secili][0];
    // Seçilenler aynı adreslere geçer: adın mevcut üyesi varsa onunkiler, yoksa ilk seçilen servisinkiler.
    const kaynak = [...taslak.entries()].find(([id, x]) => ad && x.grup === ad && !secili.has(id))?.[1] ?? taslak.get(ilk);
    const hucreler = JSON.parse(JSON.stringify(kaynak.hucreler));
    for (const id of secili) {
      const t = taslak.get(id);
      t.grup = ad;
      if (ad) for (const o of ortamlar) if (t.hucreler[o.id].mod !== 'eski' && hucreler[o.id].mod !== 'eski') t.hucreler[o.id] = { ...hucreler[o.id] };
    }
    ciz();
  });

  // --- Etki önizlemesi ve kayıt ---------------------------------------------------------------------------------------
  const etkiGoster = h('button', { type: 'button', class: 'birincil' }, ikon('liste'), 'Etkiyi göster');
  const geriAl = h('button', { type: 'button' }, 'Değişiklikleri geri al');
  geriAl.addEventListener('click', () => { for (const s of satirlar) taslak.set(s.servisId, JSON.parse(JSON.stringify(ozgun.get(s.servisId)))); ciz(); });
  const hucreMetni = (x) => (x.kaynak === 'yok' ? 'bu ortamda yok' : x.kaynak === 'ortam' ? `${x.deger} (ortamın adresi)` : x.deger);
  etkiGoster.addEventListener('click', async () => {
    mesaj.temizle();
    const d = degisiklikler();
    for (const [id, x] of Object.entries(d)) {
      for (const [, a] of Object.entries(x.tabanlar || {})) {
        if (a && !adresGecerliMi(a)) { mesaj.goster(`${satirlar.find((s) => s.servisId === id).ad}: "${a}" geçerli bir http(s) adresi değil.`); return; }
      }
    }
    try {
      const { onizleme: e } = await mesgulIken(etkiGoster, 'Hesaplanıyor…', () => api('/platform/servis-tabanlari/uygula', { govde: { projeId: proje.id, degisiklikler: d } }));
      const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Onayla ve kaydet');
      const vazgec = h('button', { type: 'button' }, 'Vazgeç');
      vazgec.addEventListener('click', () => yerlestir(etkiKap));
      kaydet.addEventListener('click', async () => {
        try {
          await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-tabanlari/uygula', { govde: { projeId: proje.id, degisiklikler: d, onay: true } }));
          bildir(`${e.toplam.servis} servisin taban adresi güncellendi.`);
          await yukle(kap, proje);
        } catch (h2) { mesaj.goster(h2.message); }
      });
      yerlestir(etkiKap, h('div', { class: 'kart', role: 'region', 'aria-label': 'Değişikliğin etkisi' },
        h('div', { class: 'not-kutusu uyari', role: 'alert' },
          `Bu değişiklik ${e.toplam.servis} servisin ${e.toplam.senaryo} senaryosunu${e.toplam.akis ? ` ve ${e.toplam.akis} akışı` : ''} etkileyecek: sonraki koşular yeni adreslere gider. Onaylamadan hiçbir şey kaydedilmez.`),
        h('ul', { class: 'onay-listesi' }, e.servisler.map((s) => h('li', {}, h('b', {}, s.ad), ` — ${s.senaryoSayisi} senaryo`, s.akislar.length ? ` · akışlar: ${s.akislar.join(', ')}` : '',
          s.grup.eski !== s.grup.yeni ? h('div', { class: 'kucuk' }, `Taban adres adı: ${s.grup.eski || 'yok'} → ${s.grup.yeni || 'yok'}`) : null,
          h('ul', {}, s.adresler.map((a) => h('li', { class: 'kucuk' }, h('b', {}, `${a.ortam}: `), h('code', { class: 'duz' }, hucreMetni(a.eski)), ' → ', h('code', { class: 'duz' }, hucreMetni(a.yeni)))))))),
        h('p', { class: 'soluk kucuk' }, 'Erişim kontrolü yapılmaz (dış istek atılmaz); SOAP servisinde isterseniz servis sayfasından kontrol edin.'),
        h('div', { class: 'dugmeler' }, kaydet, vazgec)));
      kaydet.focus();
    } catch (h2) { mesaj.goster(h2.message); }
  });

  yerlestir(kap, baslik,
    h('p', { class: 'soluk kucuk' }, 'Her servisin ortam başına adresinin başı (yol servis ayarında kalır). Aynı sunucuyu paylaşan servisleri bir ada bağlayın: bir hücre değişince o ada bağlı tüm servisler birlikte değişir. Değişiklikler önce etki önizlemesinde gösterilir; onaylamadan kaydedilmez.'),
    mesaj.kutu, grupListesi,
    h('details', { class: 'taban-toplu' }, h('summary', {}, 'Toplu düzenle (seçili satırlar; seçim yoksa tümü)'),
      h('fieldset', {}, h('legend', {}, 'Bul ve değiştir'), h('div', { class: 'satir-duzen' }, alan('Ortam', bulOrtam), alan('Bul', bul), alan('Yerine', yeni), degistir)),
      h('fieldset', {}, h('legend', {}, 'Seçilenlere adres ata'), h('div', { class: 'satir-duzen' }, alan('Ortam', atamaOrtami), alan('Adres türü', atamaModu), alan('Adres', atamaAdresi), ata)),
      h('fieldset', {}, h('legend', {}, 'Taban adres adı'), h('div', { class: 'satir-duzen' }, alan('Ad', grupAdi, { yardim: 'Boş bırakılırsa seçilenlerin adı kaldırılır.' }), bagla))),
    tabloKap,
    h('div', { class: 'dugmeler' }, etkiGoster, geriAl, durumMetni),
    etkiKap);
  ciz();
}
