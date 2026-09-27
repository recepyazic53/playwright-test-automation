// SQL SORGUSU ADIMI FORMU (ortak: ekranların akış tasarımı ve servis akışı tasarımı) — "+ > SQL sorgusu" bloğunun alanları:
// veritabanı bağlantısı (Ayarlar > Entegrasyonlar > Veritabanı bağlantısı), SQL (yer tutucular sürücü parametresi olur),
// beklenen sonuç, yeniden deneme, zaman aşımı ve sonuçtan okunan değerler (${akis:Ad}). Tanım nesnesi yerinde değiştirilir;
// her değişiklikte degisti() çağrılır (form yeniden çizilmez, odak korunur). Kurallar: sql-adimi.mjs (sunucuyla ortak).
// Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { alan, api, h, ikon, yerlestir } from './ortak.js';
import { SQL_BEKLENEN_ETIKETLERI, SQL_BEKLENEN_TURLERI, sqlYerTutuculari } from './sql-adimi.mjs';

/**
 * @typedef {{ id: string; ad: string; etkin: boolean; surucu: string; yalnizOkuma: boolean; ortamIdleri?: string[] }} SqlBaglantisi
 * @typedef {{ id: string; ad: string; aciklama?: string; eslemeler: Record<string, string> }} SqlVeritabani
 * @typedef {{ baglantilar: SqlBaglantisi[]; veritabanlari: SqlVeritabani[]; ortamlar: Array<{ id: string; ad: string; canli?: boolean; varsayilan?: boolean }> }} SqlKaynaklari
 */

/** @type {Map<string, Promise<SqlKaynaklari>>} */
const kaynakOnbellegi = new Map();

/**
 * Projenin SQL hedefleri (sayfa başına bir kez): mantıksal veritabanları (Ayarlar > Entegrasyonlar > Veritabanları; önerilen),
 * doğrudan bağlantılar (eski) ve ortamlar (eşleme özeti için).
 * @param {string} projeId @returns {Promise<SqlKaynaklari>}
 */
export function sqlKaynaklariniAl(projeId) {
  if (!kaynakOnbellegi.has(projeId)) {
    kaynakOnbellegi.set(projeId, api(`/platform/sql/baglantilar?projeId=${encodeURIComponent(projeId)}`)
      .then((y) => ({ baglantilar: y.baglantilar || [], veritabanlari: y.veritabanlari || [], ortamlar: y.ortamlar || [] }))
      .catch(() => { kaynakOnbellegi.delete(projeId); return { baglantilar: [], veritabanlari: [], ortamlar: [] }; }));
  }
  return /** @type {Promise<SqlKaynaklari>} */ (kaynakOnbellegi.get(projeId));
}

/** Önbelleği boşaltır (Ayarlar'da veritabanı / bağlantı değişince). @param {string} [projeId] */
export function sqlKaynaklariniUnut(projeId) { if (projeId) kaynakOnbellegi.delete(projeId); else kaynakOnbellegi.clear(); }

/** Projenin veritabanı bağlantıları (eski imza). @param {string} projeId @returns {Promise<SqlBaglantisi[]>} */
export const sqlBaglantilariniAl = (projeId) => sqlKaynaklariniAl(projeId).then((k) => k.baglantilar);

/**
 * Yeni SQL adımının boş tanımı: önce ilk veritabanı (önerilen), yoksa ilk etkin bağlantı.
 * @param {SqlKaynaklari | SqlBaglantisi[]} k
 */
export function yeniSqlTanimi(k) {
  const kaynak = Array.isArray(k) ? { baglantilar: k, veritabanlari: [] } : k;
  const v = kaynak.veritabanlari[0];
  if (v) return { veritabaniId: v.id, sql: '', beklenen: { tur: 'bosDegil' } };
  return { baglantiId: (kaynak.baglantilar.find((b) => b.etkin) || kaynak.baglantilar[0])?.id ?? '', sql: '', beklenen: { tur: 'bosDegil' } };
}

/**
 * Adımın hedef adı (diyagram / onay listesi): veritabanı adı ya da doğrudan bağlantı adı ("?" bulunamazsa). ortamId verilirse
 * veritabanının o ortamdaki bağlantısı da eklenir ("Kayıt veritabanı → kayit-TEST" / "… → bu ortamda bağlantı yok").
 * @param {any} t @param {SqlKaynaklari} k @param {string} [ortamId]
 */
export function sqlHedefAdi(t, k, ortamId) {
  if (t?.veritabaniId) {
    const v = k.veritabanlari.find((x) => x.id === t.veritabaniId);
    if (!v) return 'Veritabanı bulunamadı';
    if (!ortamId) return v.ad;
    const b = v.eslemeler[ortamId] ? k.baglantilar.find((x) => x.id === v.eslemeler[ortamId]) : null;
    return `${v.ad} → ${b ? b.ad : 'bu ortamda bağlantı yok'}`;
  }
  return k.baglantilar.find((b) => b.id === t?.baglantiId)?.ad ?? '?';
}

/**
 * Koşu diyaloğunun SQL uyarıları: senaryoların kullandığı veritabanlarından seçilen ortamda eşlemesi olmayanlar (koşu engellenmez;
 * senaryo o SQL adımında kalır). denetim: GET /platform/sql/kosu-denetimi; harita: ekranSenaryolari / servisSenaryolari.
 * @param {{ veritabanlari: SqlVeritabani[] } | null} denetim @param {Record<string, string[]> | undefined} harita
 * @param {Array<{ id: string; baslik: string }>} senaryolar @param {{ id: string; ad: string }} ortam
 * @returns {Array<{ baslik: string; neden: string }>}
 */
export function sqlKosuUyarilari(denetim, harita, senaryolar, ortam) {
  if (!denetim || !harita) return [];
  /** @type {Array<{ baslik: string; neden: string }>} */
  const uyarilar = [];
  for (const x of senaryolar) {
    const eksik = (harita[x.id] || []).map((id) => {
      const v = denetim.veritabanlari.find((y) => y.id === id);
      if (!v) return 'SQL adımının veritabanı bulunamadı';
      return v.eslemeler[ortam.id] ? null : `“${v.ad}” için ${ortam.ad} ortamında bağlantı tanımlı değil`;
    }).filter(Boolean);
    if (eksik.length) uyarilar.push({ baslik: x.baslik, neden: `${[...new Set(eksik)].join('; ')} — senaryo o SQL adımında kalır (Ayarlar > Entegrasyonlar > Veritabanları).` });
  }
  return uyarilar;
}

/** Koşu denetimi verisi (hata olursa null; uyarı gösterilmez, koşu yine başlar). @param {string} projeId */
export const sqlKosuDenetimiAl = (projeId) => api(`/platform/sql/kosu-denetimi?projeId=${encodeURIComponent(projeId)}`).catch(() => null);

/** Kutuda görünen kısa özet: bağlantı adı, SQL'in ilk satırı, beklenen. @param {any} t @param {Array<{ id: string; ad: string }>} baglantilar */
export function sqlOzeti(t) {
  const b = t?.beklenen || {};
  const beklenen = b.tur === 'satirSayisi' ? `satır sayısı = ${b.deger ?? '?'}`
    : b.tur === 'sutunDegeri' ? `ilk satırda ${b.sutun || '?'} = “${b.deger ?? ''}”`
      : b.tur === 'tabloEsit' ? `tablo eşit (${Array.isArray(b.satirlar) ? b.satirlar.length : 0} satır)`
        : b.tur === 'bos' ? 'sonuç boş' : 'sonuç boş değil';
  const ilk = String(t?.sql || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
  return { sqlSatiri: ilk.length > 90 ? `${ilk.slice(0, 90)}…` : ilk, beklenen };
}

/**
 * @param {any} t SQL tanımı (yerinde değişir)
 * @param {{ baglantilar: SqlBaglantisi[]; veritabanlari?: SqlVeritabani[]; ortamlar?: SqlKaynaklari['ortamlar']; onek?: string;
 *   degisti: () => void; gizliMi?: (ad: string) => boolean; yerTutucuOrnegi?: string }} s
 */
export function sqlAdimiFormu(t, s) {
  const onek = s.onek ?? '';
  const degisti = () => s.degisti();
  const veritabanlari = s.veritabanlari ?? [];
  const ortamlar = s.ortamlar ?? [];
  // Hedef seçimi: önce Veritabanları (önerilen; ortama göre bağlantı), sonra doğrudan bağlantı (eski). Değer "v:<id>" / "b:<id>".
  const secili = t.veritabaniId ? `v:${t.veritabaniId}` : t.baglantiId ? `b:${t.baglantiId}` : '';
  const baglanti = h('select', { 'aria-label': `${onek}Veritabanı` },
    h('option', { value: '' }, veritabanlari.length || s.baglantilar.length ? '— veritabanı seçin —' : '— veritabanı yok —'),
    veritabanlari.length ? h('optgroup', { label: 'Veritabanları (önerilen)' },
      veritabanlari.map((v) => h('option', { value: `v:${v.id}`, selected: secili === `v:${v.id}` }, v.ad))) : null,
    s.baglantilar.length ? h('optgroup', { label: 'Doğrudan bağlantı (eski)' },
      s.baglantilar.map((b) => h('option', { value: `b:${b.id}`, selected: secili === `b:${b.id}` }, `${b.ad} (${b.surucu}${b.etkin ? '' : ', kapalı'}${b.yalnizOkuma ? ', yalnız okuma' : ''})`))) : null,
    t.veritabaniId && !veritabanlari.some((v) => v.id === t.veritabaniId) ? h('option', { value: secili, selected: true }, 'Kayıtlı veritabanı bulunamadı') : null,
    t.baglantiId && !s.baglantilar.some((b) => b.id === t.baglantiId) ? h('option', { value: secili, selected: true }, 'Kayıtlı bağlantı bulunamadı') : null);
  // Seçimin altı: veritabanında ortam eşlemeleri; doğrudan bağlantıda "Veritabanına çevir…" (bağlantının eşli olduğu veritabanları).
  const hedefBilgisi = h('div', { class: 'sql-hedef-bilgisi kucuk', 'aria-live': 'polite' });
  const bagAdi = (id) => s.baglantilar.find((b) => b.id === id)?.ad ?? 'bulunamadı';
  const hedefBilgisiCiz = () => {
    if (t.veritabaniId) {
      const v = veritabanlari.find((x) => x.id === t.veritabaniId);
      yerlestir(hedefBilgisi, v && ortamlar.length ? h('ul', { class: 'sql-eslemeler', 'aria-label': `${onek}Ortam eşlemeleri` },
        ortamlar.map((o) => h('li', { class: v.eslemeler[o.id] ? null : 'eslemesiz' }, h('b', {}, o.ad), ' → ', v.eslemeler[o.id] ? bagAdi(v.eslemeler[o.id]) : 'bu ortamda kullanılmaz'))) : null);
      return;
    }
    if (!t.baglantiId) { yerlestir(hedefBilgisi); return; }
    const adaylar = veritabanlari.filter((v) => Object.values(v.eslemeler).includes(t.baglantiId));
    const panel = h('div', { class: 'sql-cevir-paneli', hidden: true },
      adaylar.length
        ? [h('p', { class: 'soluk' }, 'Bu bağlantının eşli olduğu veritabanları:'),
          h('div', { class: 'dugmeler' }, adaylar.map((v) => h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
            delete t.baglantiId; t.veritabaniId = v.id; baglanti.value = `v:${v.id}`; hedefBilgisiCiz(); degisti();
          } }, `→ ${v.ad} (${ortamlar.filter((o) => v.eslemeler[o.id] === t.baglantiId).map((o) => o.ad).join(', ') || 'eşli'})`)))]
        : h('p', { class: 'soluk' }, 'Bu bağlantı hiçbir veritabanında eşli değil. Ayarlar > Entegrasyonlar > Veritabanları’ndan bir veritabanı ekleyip ortamlara bağlantı seçin.'));
    const cevir = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-expanded': 'false', onclick: () => {
      panel.hidden = !panel.hidden; cevir.setAttribute('aria-expanded', String(!panel.hidden));
    } }, 'Veritabanına çevir…');
    yerlestir(hedefBilgisi, h('p', { class: 'soluk' }, 'Doğrudan bağlantı her ortamda aynı bağlantıya gider. Ortama göre doğru veritabanı için bir “Veritabanı” seçin. ', cevir), panel);
  };
  baglanti.addEventListener('change', () => {
    const [tur, id] = [baglanti.value.slice(0, 2), baglanti.value.slice(2)];
    delete t.veritabaniId; delete t.baglantiId;
    if (tur === 'v:') t.veritabaniId = id; else if (tur === 'b:') t.baglantiId = id; else t.baglantiId = '';
    hedefBilgisiCiz(); degisti();
  });
  hedefBilgisiCiz();

  const sql = h('textarea', { rows: '5', spellcheck: 'false', class: 'kod-girdisi', maxlength: '20000', 'aria-label': `${onek}SQL sorgusu`,
    placeholder: `SELECT durum FROM kayitlar WHERE no = ${s.yerTutucuOrnegi ?? '${akis:KayitNo}'}` });
  sql.value = t.sql || '';
  const sqlUyarisi = h('p', { class: 'hata-metni kucuk', role: 'status' });
  const sqlDenetle = () => {
    const m = sqlYerTutuculari(sql.value).metinde;
    sqlUyarisi.textContent = m.length ? `Tırnak / yorum içindeki yer tutucu parametre olmaz: ${m.map((x) => `\${${x}}`).join(', ')}. Tırnaksız yazın.` : '';
  };
  sql.addEventListener('input', () => { t.sql = sql.value; sqlDenetle(); degisti(); });
  sqlDenetle();

  // Beklenen sonuç: tür + türe göre alanlar.
  const beklenenKap = h('div', { class: 'sql-beklenen' });
  const tur = h('select', { 'aria-label': `${onek}Beklenen sonuç` },
    SQL_BEKLENEN_TURLERI.map((d) => h('option', { value: d, selected: (t.beklenen?.tur ?? 'bosDegil') === d }, SQL_BEKLENEN_ETIKETLERI[d])));
  const beklenenCiz = () => {
    const b = t.beklenen;
    if (b.tur === 'satirSayisi') {
      const n = h('input', { type: 'number', min: '0', max: '1000', step: '1', value: String(b.deger ?? 1), 'aria-label': `${onek}Beklenen satır sayısı` });
      n.addEventListener('input', () => { b.deger = n.value === '' ? '' : Number(n.value); degisti(); });
      return [alan('Satır sayısı', n)];
    }
    if (b.tur === 'sutunDegeri') {
      const sutun = h('input', { type: 'text', value: b.sutun ?? '', maxlength: '128', spellcheck: 'false', placeholder: 'DURUM', 'aria-label': `${onek}Beklenen sütun` });
      const deger = h('input', { type: 'text', value: b.deger ?? '', maxlength: '2000', placeholder: 'ONAYLANDI', 'aria-label': `${onek}Beklenen değer` });
      sutun.addEventListener('input', () => { b.sutun = sutun.value; degisti(); });
      deger.addEventListener('input', () => { b.deger = deger.value; degisti(); });
      return [h('div', { class: 'sql-iki-sutun' }, alan('Sütun', sutun), alan('Değer', deger, { yardim: 'Sayılar sayısal karşılaştırılır (1.0 = 1); boş hücre NULL yazılır.' }))];
    }
    if (b.tur === 'tabloEsit') {
      const sutunlar = h('input', { type: 'text', value: (b.sutunlar || []).join(', '), spellcheck: 'false', placeholder: 'NO, DURUM (boş: tüm sütunlar)', 'aria-label': `${onek}Karşılaştırılan sütunlar` });
      const satirlar = h('textarea', { rows: '4', spellcheck: 'false', class: 'kod-girdisi', 'aria-label': `${onek}Beklenen satırlar`, placeholder: '1 | ONAYLANDI\n2 | BEKLIYOR' });
      satirlar.value = (b.satirlar || []).map((r) => r.join(' | ')).join('\n');
      sutunlar.addEventListener('input', () => { b.sutunlar = sutunlar.value.split(',').map((x) => x.trim()).filter(Boolean); degisti(); });
      satirlar.addEventListener('input', () => { b.satirlar = satirlar.value.split('\n').filter((x) => x.trim()).map((x) => x.split('|').map((y) => y.trim())); degisti(); });
      return [alan('Sütunlar', sutunlar), alan('Beklenen satırlar', satirlar, { yardim: 'Her satır bir kayıt; değerler “|” ile ayrılır. Sıra önemlidir (sorguda ORDER BY kullanın).' })];
    }
    return [h('p', { class: 'soluk kucuk' }, b.tur === 'bos' ? 'Sorgu hiç satır döndürmezse adım geçer.' : 'Sorgu en az bir satır döndürürse adım geçer.')];
  };
  const beklenenYenile = () => { const odak = document.activeElement; beklenenKap.replaceChildren(...beklenenCiz()); if (odak === tur) tur.focus(); };
  tur.addEventListener('change', () => {
    const eski = t.beklenen || {};
    t.beklenen = tur.value === 'satirSayisi' ? { tur: 'satirSayisi', deger: 1 } : tur.value === 'sutunDegeri' ? { tur: 'sutunDegeri', sutun: eski.sutun ?? '', deger: eski.deger ?? '' }
      : tur.value === 'tabloEsit' ? { tur: 'tabloEsit', sutunlar: [], satirlar: [] } : { tur: tur.value };
    beklenenYenile();
    degisti();
  });
  if (!t.beklenen || !SQL_BEKLENEN_TURLERI.includes(t.beklenen.tur)) t.beklenen = { tur: 'bosDegil' };
  beklenenYenile();

  // Yeniden deneme ve zaman aşımı.
  const tekrar = h('input', { type: 'checkbox', checked: Boolean(t.yenidenDeneme) });
  const sure = h('input', { type: 'number', min: '1', max: '600', step: '1', value: String(t.yenidenDeneme?.sureSn ?? 30), 'aria-label': `${onek}Yeniden deneme süresi (sn)` });
  const aralik = h('input', { type: 'number', min: '1', max: '60', step: '1', value: String(t.yenidenDeneme?.aralikSn ?? 3), 'aria-label': `${onek}Yeniden deneme aralığı (sn)` });
  const tekrarAlanlari = h('div', { class: 'sql-iki-sutun', hidden: !t.yenidenDeneme }, alan('En çok (sn)', sure), alan('Her (sn)', aralik));
  const tekrarYaz = () => { if (tekrar.checked) t.yenidenDeneme = { sureSn: Number(sure.value), aralikSn: Number(aralik.value) }; else delete t.yenidenDeneme; tekrarAlanlari.hidden = !tekrar.checked; degisti(); };
  tekrar.addEventListener('change', tekrarYaz);
  sure.addEventListener('input', tekrarYaz);
  aralik.addEventListener('input', tekrarYaz);
  const zaman = h('input', { type: 'number', min: '1', max: '300', step: '1', value: t.zamanAsimiSn ?? '', placeholder: 'bağlantınınki', 'aria-label': `${onek}Sorgu zaman aşımı (sn)` });
  zaman.addEventListener('input', () => { if (zaman.value === '') delete t.zamanAsimiSn; else t.zamanAsimiSn = Number(zaman.value); degisti(); });

  // Sonuçtan okunan değerler (ilk satır): sonraki adımlarda ${akis:Ad}.
  const okumaKap = h('div', { class: 'okuma-listesi' });
  const okumalariCiz = () => {
    const l = Array.isArray(t.okumalar) ? t.okumalar : [];
    okumaKap.replaceChildren(...l.map((o, k) => {
      const ad = h('input', { type: 'text', value: o.ad ?? '', maxlength: '60', placeholder: 'KayitNo', autocomplete: 'off', 'aria-label': `${onek}${k + 1}. okuma adı` });
      const sutun = h('input', { type: 'text', value: o.sutun ?? '', maxlength: '128', spellcheck: 'false', placeholder: 'NO', 'aria-label': `${onek}${k + 1}. okuma sütunu` });
      const gizli = h('input', { type: 'checkbox', checked: o.gizli ?? Boolean(s.gizliMi?.(o.ad ?? '')), 'aria-label': `${onek}${k + 1}. okuma gizli`, title: 'Gizli: raporlarda maskelenir' });
      ad.addEventListener('input', () => { o.ad = ad.value.trim(); if (o.gizli === undefined) gizli.checked = Boolean(s.gizliMi?.(o.ad)); degisti(); });
      sutun.addEventListener('input', () => { o.sutun = sutun.value.trim(); degisti(); });
      gizli.addEventListener('change', () => { o.gizli = gizli.checked; degisti(); });
      return h('div', { class: 'okuma-karti' },
        h('div', { class: 'okuma-ust' }, ad, sutun),
        h('div', { class: 'okuma-alt' }, h('label', { class: 'secenek' }, gizli, 'gizli'),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${onek}${k + 1}. okumayı sil`, onclick: () => {
            l.splice(k, 1); if (!l.length) delete t.okumalar; okumalariCiz(); degisti();
          } }, ikon('carpi'))));
    }));
  };
  okumalariCiz();

  return h('div', { class: 'sql-adimi-formu' },
    alan('Veritabanı', baglanti, { yardim: veritabanlari.length || s.baglantilar.length
      ? 'Veritabanları (Ayarlar > Entegrasyonlar > Veritabanları) koşunun ortamına göre doğru bağlantıya gider; doğrudan bağlantı her ortamda aynıdır.'
      : 'Henüz veritabanı yok: Ayarlar > Entegrasyonlar’dan bağlantı ekleyip Veritabanları’nda ortamlara eşleyin.' }),
    hedefBilgisi,
    alan('SQL sorgusu', sql, { yardim: `Değerleri ${s.yerTutucuOrnegi ?? '${akis:Ad}'} gibi tırnaksız yazın; SQL’e metin olarak eklenmez, parametre olarak bağlanır. “Yalnız okuma” açık bağlantıda yalnız SELECT / WITH çalışır.` }),
    sqlUyarisi,
    alan('Beklenen sonuç', tur), beklenenKap,
    h('label', { class: 'secenek' }, tekrar, 'Sonuç uymazsa tekrar sorgula (veri geç yazılıyorsa)'),
    tekrarAlanlari,
    alan('Sorgu zaman aşımı (sn)', zaman),
    h('fieldset', {}, h('legend', {}, 'Sonuçtan oku (ilk satır)'),
      h('p', { class: 'soluk kucuk' }, 'Okunan değer sonraki adımlarda ', h('code', {}, '${akis:Ad}'), ' ile kullanılır.'),
      okumaKap,
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => {
        (t.okumalar ??= []).push({ ad: '', sutun: '' }); okumalariCiz(); degisti();
        okumaKap.querySelector('.okuma-karti:last-child input')?.focus();
      } }, ikon('arti'), 'Sütundan oku')));
}
