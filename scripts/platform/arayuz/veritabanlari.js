// AYARLAR > ENTEGRASYONLAR > VERİTABANLARI — mantıksal veritabanları: SQL adımı bir bağlantıya değil veritabanına bağlanır;
// koşu, seçilen ortamın eşlemesindeki bağlantıya gider (satır = veritabanı, sütun = ortam, hücre = bağlantı; boş = "bu ortamda
// kullanılmaz"). Kurallar sunucuda (scripts/platform/sql/veritabanlari.mjs): bağlantı "Veritabanı bağlantısı" türünde olmalı ve
// ortam kısıtı varsa o ortamı içermeli; farklı sürücüler eşlenebilir (uyarı). Silme: kullanan SQL adımları listelenir, onay ister.
// Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h(); innerHTML yok).
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, rozet, yerlestir } from './ortak.js';
import { onayIste } from './ekran-ortak.js';
import { riskliOrtamMi } from './kosu-paneli.js';
import { sqlKaynaklariniUnut } from './sql-adimi-formu.js';

/**
 * @param {{ id: string }} proje @param {Array<{ id: string; ad: string; varsayilan?: boolean; canli?: boolean }>} ortamlar
 * @param {Array<{ id: string; ad: string; tur: string; etkin: boolean; ortamIdleri: string[]; alanlar: Record<string, any> }>} baglantilar tüm bağlantılar (veritabanı türü süzülür)
 * @param {() => void} yenile
 * @returns {Promise<HTMLElement>}
 */
export async function veritabanlariBolumu(proje, ortamlar, baglantilar, yenile) {
  const { veritabanlari } = await api(`/platform/sql/veritabanlari?projeId=${encodeURIComponent(proje.id)}`);
  const vtBaglantilari = baglantilar.filter((b) => b.tur === 'veritabani');
  const bagAdi = (id) => vtBaglantilari.find((b) => b.id === id)?.ad ?? 'bulunamadı';
  const formAlani = h('div', { class: 'entegrasyon-form-alani' });
  const yenidenCiz = () => { sqlKaynaklariniUnut(proje.id); yenile(); };
  const duzenle = (v) => {
    yerlestir(formAlani, veritabaniFormu({ proje, ortamlar, baglantilar: vtBaglantilari, veritabani: v, kapat: () => formAlani.replaceChildren(), kaydedildi: yenidenCiz }));
    formAlani.querySelector('input')?.focus();
  };

  const sil = async (v) => {
    try {
      const { adimlar } = await api('/platform/sql/veritabani/kullanim', { govde: { projeId: proje.id, id: v.id } });
      const tamam = await onayIste({
        baslik: `“${v.ad}” silinsin mi?`,
        metin: adimlar.length
          ? `Bu veritabanını ${adimlar.length} SQL adımı kullanıyor. Silerseniz bu adımlar koşuda “veritabanı bulunamadı” hatasıyla kalır; başka bir veritabanı seçmeniz gerekir.`
          : 'Veritabanı ve ortam eşlemeleri silinir. Bağlantılar silinmez.',
        liste: adimlar, dugme: adimlar.length ? 'Yine de sil' : 'Sil', tehlikeli: true
      });
      if (!tamam) return;
      await api('/platform/sql/veritabani/sil', { govde: { projeId: proje.id, id: v.id, onay: true } });
      bildir('Veritabanı silindi.');
      yenidenCiz();
    } catch (e) { bildir(e.message, 'hata'); }
  };

  const tablo = h('div', { class: 'tablo-kaydirma veritabani-tablosu-kap' },
    h('table', { class: 'veri-tablosu veritabani-tablosu', 'aria-label': 'Veritabanları ve ortam eşlemeleri' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Veritabanı'),
        ortamlar.map((o) => h('th', { scope: 'col', class: riskliOrtamMi(o) ? 'riskli-ortam' : null },
          o.ad, riskliOrtamMi(o) ? rozet([ikon('uyari'), o.riskli === null ? 'riskli mi?' : 'riskli'], 'hata', { title: 'Riskli ortam: bu sütundaki bağlantıya koşu sırasında gerçek sorgu gider.' }) : null)),
        h('th', { scope: 'col' }, h('span', { class: 'gorunmez' }, 'İşlemler')))),
      h('tbody', {}, veritabanlari.map((v) => h('tr', {},
        h('th', { scope: 'row' }, h('strong', {}, v.ad),
          v.aciklama ? h('div', { class: 'soluk kucuk' }, v.aciklama) : null,
          h('div', { class: 'soluk kucuk' }, v.adimSayisi ? `${v.adimSayisi} SQL adımında` : 'Henüz kullanan SQL adımı yok'),
          v.uyarilar.length ? h('ul', { class: 'veritabani-uyarilari kucuk', role: 'note' }, v.uyarilar.map((u) => h('li', {}, ikon('uyari'), u))) : null),
        ortamlar.map((o) => h('td', { class: v.eslemeler[o.id] ? null : 'eslemesiz', 'data-ortam': o.ad },
          v.eslemeler[o.id] ? bagAdi(v.eslemeler[o.id]) : h('span', { class: 'cok-soluk', title: 'SQL adımı bu ortamda sorgu atmadan hatayla kalır.' }, '— kullanılmaz'))),
        h('td', { class: 'eylem' },
          h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${v.ad}: düzenle`, onclick: () => duzenle(v) }, ikon('duzenle'), 'Düzenle'),
          h('button', { type: 'button', class: 'kucuk-dugme tehlike', 'aria-label': `${v.ad}: sil`, onclick: () => sil(v) }, ikon('cop'), 'Sil')))))));

  return h('section', { class: 'veritabanlari-bolumu', 'aria-labelledby': 'veritabanlari-basligi' },
    h('div', { class: 'bolum-basligi' },
      h('h3', { id: 'veritabanlari-basligi' }, 'Veritabanları', rozet(String(veritabanlari.length))),
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'birincil', disabled: !ortamlar.length, onclick: () => duzenle(null) }, ikon('arti'), 'Veritabanı ekle'))),
    h('p', { class: 'soluk kucuk' }, 'SQL adımları bir veritabanına bağlanır; koşu, seçilen ortamdaki bağlantıya gider (ör. TEST koşusu TEST bağlantısına). Boş hücre: bu ortamda kullanılmaz, adım sorgu atmadan hatayla kalır.'),
    formAlani,
    veritabanlari.length ? tablo
      : bosDurum('Henüz veritabanı yok.', vtBaglantilari.length
        ? '“+ Veritabanı ekle” ile bir veritabanı tanımlayıp her ortam için bağlantısını seçin.'
        : 'Önce aşağıdaki türlerden “Veritabanı bağlantısı” ekleyin (her ortam için ayrı), sonra burada ortamlara eşleyin.', { ikon: 'veri', rol: 'status' }));
}

/**
 * Ekle / düzenle formu.
 * @param {{ proje: { id: string }; ortamlar: Array<{ id: string; ad: string; varsayilan?: boolean; canli?: boolean }>; baglantilar: any[]; veritabani: any;
 *   kapat: () => void; kaydedildi: () => void }} s
 */
function veritabaniFormu(s) {
  const v = s.veritabani;
  const mesaj = mesajKutusu();
  const ad = h('input', { type: 'text', maxlength: '120', value: v ? v.ad : '', placeholder: 'ör. Kayıt veritabanı', autocomplete: 'off' });
  const aciklama = h('input', { type: 'text', maxlength: '500', value: v ? v.aciklama || '' : '', placeholder: 'isteğe bağlı' });
  const uyari = h('div', { class: 'not-kutusu uyari', role: 'status', hidden: true });
  const secimler = s.ortamlar.map((o) => {
    const secim = h('select', { 'aria-label': `${o.ad} ortamında bağlantı` },
      h('option', { value: '' }, '— bu ortamda kullanılmaz —'),
      s.baglantilar.map((b) => {
        // Ortam kısıtı olan bağlantı yalnız kendi ortamlarında seçilebilir (sunucu da reddeder).
        const kapali = Array.isArray(b.ortamIdleri) && b.ortamIdleri.length > 0 && !b.ortamIdleri.includes(o.id);
        return h('option', { value: b.id, disabled: kapali && v?.eslemeler[o.id] !== b.id, selected: v?.eslemeler[o.id] === b.id },
          `${b.ad}${b.alanlar?.surucu ? ` (${b.alanlar.surucu})` : ''}${b.etkin ? '' : ' — kapalı'}${kapali ? ' — bu ortama açık değil' : ''}`);
      }));
    secim.addEventListener('change', uyarilariGuncelle);
    return { ortam: o, secim };
  });
  function uyarilariGuncelle() {
    const secili = secimler.map((x) => s.baglantilar.find((b) => b.id === x.secim.value)).filter(Boolean);
    const suruculer = [...new Set(secili.map((b) => String(b.alanlar?.surucu ?? '')))];
    const l = [];
    if (suruculer.length > 1) l.push(`Ortamlarda farklı sürücüler var (${suruculer.join(', ')}): SQL söz dizimi ortamlar arasında uyuşmayabilir.`);
    for (const b of secili) if (!b.etkin) l.push(`“${b.ad}” bağlantısı kapalı; o ortamda SQL adımı çalışmaz.`);
    uyari.hidden = !l.length;
    yerlestir(uyari, [...new Set(l)].map((m) => h('p', {}, ikon('uyari'), m)));
  }
  uyarilariGuncelle();

  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    alanHatasi(ad, '');
    if (!ad.value.trim()) { alanHatasi(ad, 'Ad boş olamaz.'); ad.focus(); return; }
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/sql/veritabani/kaydet', { govde: {
        projeId: s.proje.id, id: v ? v.id : undefined, ad: ad.value.trim(), aciklama: aciklama.value.trim(),
        eslemeler: Object.fromEntries(secimler.map((x) => [x.ortam.id, x.secim.value]))
      } }));
      bildir(r.uyarilar && r.uyarilar.length ? `Veritabanı kaydedildi. ${r.uyarilar.join(' ')}` : 'Veritabanı kaydedildi.', r.uyarilar && r.uyarilar.length ? 'hata' : 'basari');
      s.kapat();
      s.kaydedildi();
    } catch (e) { mesaj.goster(e.message); }
  });

  return h('div', { class: 'kart form-paneli veritabani-formu', role: 'group', 'aria-label': v ? `${v.ad}: düzenle` : 'Yeni veritabanı' },
    h('div', { class: 'kart-basligi' }, h('h4', {}, ikon('veri'), v ? `“${v.ad}” veritabanı` : 'Yeni veritabanı')),
    mesaj.kutu,
    h('div', { class: 'satir-duzen' }, alan('Ad', ad, { zorunlu: true }), alan('Açıklama', aciklama)),
    h('fieldset', { class: 'veritabani-eslemeleri' }, h('legend', {}, 'Ortamlara göre bağlantı'),
      s.baglantilar.length ? null : h('p', { class: 'soluk kucuk' }, 'Projede “Veritabanı bağlantısı” yok; önce bağlantı ekleyin.'),
      secimler.map((x) => h('div', { class: `alan ${riskliOrtamMi(x.ortam) ? 'riskli-ortam' : ''}` },
        h('label', { for: x.secim.id || (x.secim.id = `vt-esleme-${x.ortam.id}`) }, x.ortam.ad,
          riskliOrtamMi(x.ortam) ? rozet([ikon('uyari'), x.ortam.riskli === null ? 'riskli mi?' : 'riskli'], 'hata') : null),
        x.secim))),
    uyari,
    h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: s.kapat }, 'Vazgeç'), kaydet));
}
