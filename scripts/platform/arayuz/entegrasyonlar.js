// AYARLAR > ENTEGRASYONLAR — dış uygulamalarla bağlantılar (webhook bildirimi, iş takip sistemi, veritabanı). Türler sunucudaki
// katalogdan gelir (scripts/platform/entegrasyonlar/katalog.mjs); form alan tanımlarından çizilir. Bağlama süreci bir sihirbazdır:
// tür seç → alanları doldur (gizliler maskeli) → "Bağlantıyı dene" (YALNIZ siz basınca, önce hedef adresi gösteren onayla) → kaydet.
// Gizli alanlar API'den { dolu, maske } olarak gelir; boş bırakılırsa kayıtlı değer korunur.
// Ayrıca: Sonuçlar'daki test ayrıntısı için "Hata kaydı aç" düğmesi (hataKaydiDugmesi) ve DBeaver bağlantılarını içe aktarma.
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, parolaAlani, rozet, tarihMetni, yeniKimlik, yerlestir } from './ortak.js';
import { diyalogAc, onayIste } from './ekran-ortak.js';
import { sqlKaynaklariniUnut } from './sql-adimi-formu.js';
import { veritabanlariBolumu } from './veritabanlari.js';

const DURUM = {
  bagli: ['Bağlı', 'basari'],
  hata: ['Hata', 'hata'],
  denenmedi: ['Denenmedi', 'uyari']
};
const durumRozeti = (d) => {
  const [metin, tur] = DURUM[d ? d.sonuc : 'denenmedi'] || DURUM.denenmedi;
  return rozet(metin, tur, { title: d ? `${tarihMetni(d.zaman)} — ${d.mesaj}` : 'Bu bağlantı henüz denenmedi.' });
};

/** Onaylı deneme: önce hedef (gizli yol yazılmadan) gösterilir, onay gelirse istek gider. */
async function onayliDene(govde) {
  const { hedef } = await api('/platform/entegrasyon/dene-hedefi', { govde });
  const tamam = await onayIste({
    baslik: 'Bağlantıyı dene', metin: `${hedef.aciklama} Devam edilsin mi?`, liste: [hedef.adres], dugme: 'Denemeyi gönder', ikonAd: 'simsek'
  });
  if (!tamam) return null;
  const { sonuc } = await api('/platform/entegrasyon/dene', { govde: { ...govde, onay: true } });
  return sonuc;
}

// ---------------------------------------------------------------------------------------
// Bölüm
// ---------------------------------------------------------------------------------------

/**
 * @param {HTMLElement} govde
 * @param {{ durum: any }} baglam
 * @param {() => void} yenile
 */
export async function entegrasyonlarBolumu(govde, baglam, yenile) {
  const proje = baglam.durum.proje;
  // SQL adımı seçim listeleri (sayfa önbelleği) bu bölümde yapılan değişikliklerden sonra yeniden okunsun.
  sqlKaynaklariniUnut(proje.id);
  const [{ turler, baglantilar }, { ortamlar }] = await Promise.all([
    api(`/platform/entegrasyonlar?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/ortamlar?projeId=${encodeURIComponent(proje.id)}`)
  ]);
  const turAdi = (t) => (turler.find((x) => x.tur === t) || { ad: t }).ad;
  const ortamAdi = (id) => (ortamlar.find((o) => o.id === id) || { ad: 'silinmiş ortam' }).ad;
  const formAlani = h('div', { class: 'entegrasyon-form-alani' });
  const sihirbaz = (b) => {
    yerlestir(formAlani, baglantiSihirbazi({ proje, turler, ortamlar, baglanti: b, kapat: () => formAlani.replaceChildren(), kaydedildi: yenile }));
    formAlani.scrollIntoView({ block: 'nearest' });
  };

  const satirlar = baglantilar.map((b) => {
    const tur = turler.find((t) => t.tur === b.tur);
    const olaylar = (tur ? tur.olaylar : []).filter((o) => b.olaylar.includes(o.ad)).map((o) => o.etiket);
    const denemeDugmesi = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${b.ad}: bağlantıyı dene` }, ikon('simsek'), 'Dene');
    denemeDugmesi.addEventListener('click', async () => {
      try {
        const s = await mesgulIken(denemeDugmesi, 'Deneniyor…', () => onayliDene({ projeId: proje.id, id: b.id }));
        if (!s) return;
        bildir(s.sonuc === 'bagli' ? `Bağlantı başarılı: ${s.mesaj}` : `Bağlantı denemesi başarısız: ${s.mesaj}`, s.sonuc === 'bagli' ? 'basari' : 'hata');
        yenile();
      } catch (hata) { bildir(hata.message, 'hata'); }
    });
    const etkinDugmesi = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${b.ad}: ${b.etkin ? 'devre dışı bırak' : 'etkinleştir'}` },
      ikon(b.etkin ? 'eksi' : 'onay'), b.etkin ? 'Devre dışı bırak' : 'Etkinleştir');
    etkinDugmesi.addEventListener('click', async () => {
      try {
        await mesgulIken(etkinDugmesi, 'Kaydediliyor…', () => api('/platform/entegrasyon/etkin', { govde: { projeId: proje.id, id: b.id, etkin: !b.etkin } }));
        bildir(b.etkin ? 'Bağlantı devre dışı bırakıldı.' : 'Bağlantı etkinleştirildi.');
        yenile();
      } catch (hata) { bildir(hata.message, 'hata'); }
    });
    const silDugmesi = h('button', { type: 'button', class: 'kucuk-dugme tehlike', 'aria-label': `${b.ad}: sil` }, ikon('cop'), 'Sil');
    silDugmesi.addEventListener('click', async () => {
      // Veritabanı bağlantısı: eşli olduğu veritabanları ve doğrudan kullanan SQL adımları önce gösterilir (adımlar kırılmasın).
      /** @type {string[]} */
      let etki = [];
      if (b.tur === 'veritabani') {
        try {
          const k = await api(`/platform/sql/baglanti-kullanimi?projeId=${encodeURIComponent(proje.id)}&baglantiId=${encodeURIComponent(b.id)}`);
          etki = [...k.veritabanlari.map((v) => `Veritabanı “${v.ad}”: ${v.ortamlar.join(', ')} ortamında eşli — eşleme kalkar, o ortamda SQL adımı çalışmaz`),
            ...k.adimlar.map((a) => `SQL adımı (doğrudan bağlantı): ${a}`)];
        } catch { etki = []; }
      }
      const tamam = await onayIste({
        baslik: 'Bağlantıyı sil',
        metin: `"${b.ad}" bağlantısı ve kasadaki gizli değerleri kalıcı olarak silinecek. Bu işlem geri alınamaz.${etki.length ? ' Şu veritabanları / SQL adımları etkilenir:' : ''}`,
        liste: etki, dugme: 'Kalıcı olarak sil', tehlikeli: true
      });
      if (!tamam) return;
      try {
        await api('/platform/entegrasyon/sil', { govde: { projeId: proje.id, id: b.id } });
        bildir('Bağlantı silindi.');
        yenile();
      } catch (hata) { bildir(hata.message, 'hata'); }
    });
    return h('li', { class: b.etkin ? null : 'pasif-kayit' },
      h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(tur ? tur.ikon : 'ag')),
      h('div', { class: 'kayit-ana' },
        h('strong', {}, b.ad, rozet(turAdi(b.tur)), durumRozeti(b.durum), b.etkin ? null : rozet('Devre dışı', 'durdu')),
        h('div', { class: 'kayit-meta' },
          [olaylar.length ? `Olaylar: ${olaylar.join(', ')}` : null,
            tur && tur.olaylar.length ? `Ortamlar: ${b.ortamIdleri.length ? b.ortamIdleri.map(ortamAdi).join(', ') : 'tümü'}` : null]
            .filter(Boolean).join(' · ') || null),
        b.durum ? h('div', { class: `kayit-meta entegrasyon-durum ${b.durum.sonuc}` }, `Son deneme ${tarihMetni(b.durum.zaman)}: ${b.durum.mesaj}`)
          : h('div', { class: 'kayit-meta soluk' }, 'Henüz denenmedi. "Dene" ile bağlantıyı sınayın.')),
      h('div', { class: 'kayit-eylemleri' }, denemeDugmesi,
        h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${b.ad}: düzenle`, onclick: () => sihirbaz(b) }, ikon('duzenle'), 'Düzenle'),
        etkinDugmesi, silDugmesi));
  });

  const dbeaver = h('button', { type: 'button', class: 'hayalet' }, ikon('veri'), 'DBeaver\'dan içe aktar');
  dbeaver.addEventListener('click', () => dbeaverIceAktar(proje, yenile));
  // Veritabanları (mantıksal; ortama göre bağlantı): SQL adımlarının önerilen hedefi (veritabanlari.js).
  const veritabanlari = await veritabanlariBolumu(proje, ortamlar, baglantilar, yenile);

  yerlestir(govde,
    h('div', { class: 'bolum-basligi' },
      h('h3', {}, 'Bağlantılar', rozet(String(baglantilar.length))),
      h('div', { class: 'dugmeler' }, dbeaver, h('button', { type: 'button', class: 'birincil', onclick: () => sihirbaz(null) }, ikon('arti'), 'Bağlantı ekle'))),
    formAlani,
    baglantilar.length ? h('ul', { class: 'kayit-listesi' }, satirlar)
      : bosDurum('Henüz bağlantı yok.', 'Bir uygulamayı bağlamak için "+ Bağlantı ekle"ye basın. Bağlantılar kasada şifreli saklanır; hiçbir istek siz denemeden ya da seçtiğiniz olay gerçekleşmeden gönderilmez.', { ikon: 'ag', rol: 'status' }),
    veritabanlari,
    h('h3', { class: 'entegrasyon-katalog-basligi' }, 'Kullanılabilir türler'),
    h('ul', { class: 'entegrasyon-katalogu' }, turler.map((t) => h('li', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h4', {}, ikon(t.ikon), t.ad)),
      h('p', { class: 'soluk kucuk' }, t.aciklama),
      h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => sihirbaz({ yeniTur: t.tur }) }, ikon('arti'), 'Bu türden bağlantı ekle')))));
}

// ---------------------------------------------------------------------------------------
// Bağlama sihirbazı
// ---------------------------------------------------------------------------------------

/** Tek alanın girdisi + değer okuyucu. */
function alanGirdisi(t, b) {
  const kayitli = b ? b.alanlar[t.ad] : undefined;
  if (t.gizli) {
    const p = parolaAlani(t.etiket, { kayitli: kayitli && kayitli.dolu ? kayitli : null, zorunlu: t.zorunlu && !(kayitli && kayitli.dolu), yardim: t.yardim });
    p.girdi.dataset.alan = t.ad;
    if (t.yerTutucu && !(kayitli && kayitli.dolu)) p.girdi.placeholder = t.yerTutucu;
    return { kapsayici: p.kapsayici, girdi: p.girdi, oku: () => p.girdi.value };
  }
  const deger = kayitli !== undefined && kayitli !== null ? kayitli : t.varsayilan;
  if (t.tur === 'onay') {
    const girdi = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', id: yeniKimlik('ent'), checked: deger === true });
    if (t.kapatmaUyarisi) {
      girdi.addEventListener('change', async () => {
        if (girdi.checked) return;
        const tamam = await onayIste({ baslik: `${t.etiket} kapatılsın mı?`, metin: t.kapatmaUyarisi, dugme: 'Evet, kapat', tehlikeli: true, ikonAd: 'uyari' });
        if (!tamam) girdi.checked = true;
      });
    }
    const kapsayici = h('label', { class: 'onay-satiri', for: girdi.id }, girdi,
      h('span', {}, h('b', {}, t.etiket), t.yardim ? h('small', { class: 'blok soluk' }, t.yardim) : null));
    return { kapsayici, girdi, oku: () => girdi.checked };
  }
  let girdi;
  if (t.tur === 'secim') {
    girdi = h('select', {}, (t.secenekler || []).map(([d, e]) => h('option', { value: d, selected: d === deger }, e)));
  } else if (t.tur === 'cok-satir') {
    girdi = h('textarea', { rows: 4, spellcheck: 'false' });
    girdi.value = deger === undefined || deger === null ? '' : String(deger);
  } else {
    girdi = h('input', {
      type: t.tur === 'sayi' ? 'number' : t.tur === 'adres' ? 'url' : 'text', autocomplete: 'off', spellcheck: 'false',
      value: deger === undefined || deger === null ? '' : String(deger), placeholder: t.yerTutucu || null,
      min: t.enAz !== undefined ? String(t.enAz) : null, max: t.enCok !== undefined ? String(t.enCok) : null
    });
  }
  girdi.dataset.alan = t.ad;
  return {
    kapsayici: alan(t.etiket, girdi, { zorunlu: t.zorunlu, yardim: t.yardim }), girdi,
    oku: () => (t.tur === 'sayi' ? (girdi.value.trim() === '' ? null : Number(girdi.value)) : girdi.value.trim())
  };
}

/**
 * @param {{ proje: any; turler: any[]; ortamlar: any[]; baglanti: any; kapat: () => void; kaydedildi: () => void }} s
 */
function baglantiSihirbazi(s) {
  const duzenleme = s.baglanti && s.baglanti.id ? s.baglanti : null;
  let tur = duzenleme ? s.turler.find((t) => t.tur === duzenleme.tur) : s.baglanti && s.baglanti.yeniTur ? s.turler.find((t) => t.tur === s.baglanti.yeniTur) : null;
  let adim = tur ? 2 : 1;
  let sonDeneme = null;
  let girdiler = [];
  const mesaj = mesajKutusu();
  const kap = h('form', { class: 'kart form-paneli entegrasyon-sihirbazi', novalidate: true, 'aria-labelledby': 'ent-sihirbaz-basligi' });

  const ad = h('input', { type: 'text', autocomplete: 'off', maxlength: '120', value: duzenleme ? duzenleme.ad : '' });
  const etkin = h('input', { type: 'checkbox', class: 'anahtar', role: 'switch', id: yeniKimlik('ent-etkin'), checked: duzenleme ? duzenleme.etkin : true });
  let olayKutulari = [];
  let ortamKutulari = [];
  let ayarlarPaneli = null;

  const adimGostergesi = () => h('ol', { class: 'entegrasyon-adimlari', 'aria-label': 'Sihirbaz adımları' },
    [['Tür', 1], ['Ayarlar', 2], ['Dene ve kaydet', 3]].map(([metin, n]) => h('li', {
      class: n === adim ? 'simdiki' : n < adim ? 'tamam' : null, 'aria-current': n === adim ? 'step' : null
    }, h('span', { class: 'adim-no' }, String(n)), metin)));

  const ayarlariKur = () => {
    girdiler = tur.alanlar.map((t) => ({ t, ...alanGirdisi(t, duzenleme) }));
    olayKutulari = tur.olaylar.map((o) => {
      const k = h('input', { type: 'checkbox', id: yeniKimlik('ent-olay'), value: o.ad, checked: duzenleme ? duzenleme.olaylar.includes(o.ad) : false });
      return { o, k };
    });
    ortamKutulari = s.ortamlar.map((o) => ({ o, k: h('input', { type: 'checkbox', id: yeniKimlik('ent-ortam'), value: o.id, checked: duzenleme ? duzenleme.ortamIdleri.includes(o.id) : false }) }));
    ayarlarPaneli = h('div', { class: 'entegrasyon-ayarlari' },
      alan('Bağlantı adı', ad, { zorunlu: true, yardim: 'Listede görünecek ad (ör. "Ekip kanalı", "Test veritabanı").' }),
      girdiler.map((g) => g.kapsayici),
      tur.olaylar.length ? h('fieldset', {}, h('legend', {}, 'Hangi olaylarda tetiklensin?'),
        olayKutulari.map(({ o, k }) => h('label', { class: 'secenek', for: k.id }, k, h('span', {}, h('b', {}, o.etiket), ' — ', h('span', { class: 'soluk' }, o.aciklama))))) : null,
      tur.olaylar.length && s.ortamlar.length ? h('fieldset', {}, h('legend', {}, 'Hangi ortamlarda?'),
        h('p', { class: 'soluk kucuk' }, 'Hiçbiri seçilmezse projenin tüm ortamlarında geçerlidir.'),
        ortamKutulari.map(({ o, k }) => h('label', { class: 'secenek', for: k.id }, k, o.ad))) : null,
      h('label', { class: 'onay-satiri', for: etkin.id }, etkin, h('span', {}, h('b', {}, 'Etkin'), h('small', { class: 'blok soluk' }, 'Devre dışı bağlantı hiçbir olayda tetiklenmez ve kullanılamaz.'))));
    // Alan değişirse önceki deneme geçersiz olur.
    ayarlarPaneli.addEventListener('input', () => { sonDeneme = null; });
    ayarlarPaneli.addEventListener('change', () => { sonDeneme = null; });
  };

  const alanlariTopla = () => Object.fromEntries(girdiler.map((g) => [g.t.ad, g.oku()]));
  const istekGovdesi = () => ({
    projeId: s.proje.id, id: duzenleme ? duzenleme.id : undefined, tur: tur.tur, ad: ad.value.trim(), alanlar: alanlariTopla(),
    olaylar: olayKutulari.filter(({ k }) => k.checked).map(({ o }) => o.ad), ortamIdleri: ortamKutulari.filter(({ k }) => k.checked).map(({ o }) => o.id), etkin: etkin.checked
  });
  const dogrula = () => {
    mesaj.temizle();
    alanHatasi(ad, '');
    let ilk = null;
    if (!ad.value.trim()) { alanHatasi(ad, 'Bağlantı adı boş olamaz.'); ilk = ilk || ad; }
    for (const g of girdiler) {
      if (g.t.tur === 'onay') continue;
      alanHatasi(g.girdi, '');
      const v = g.oku();
      const kayitliGizli = g.t.gizli && duzenleme && duzenleme.alanlar[g.t.ad] && duzenleme.alanlar[g.t.ad].dolu;
      if (g.t.zorunlu && (v === '' || v === null) && !kayitliGizli) { alanHatasi(g.girdi, `${g.t.etiket} gerekli.`); ilk = ilk || g.girdi; continue; }
      if (g.t.tur === 'adres' && v) {
        let gecerli = false;
        try { const u = new URL(v); gecerli = u.protocol === 'http:' || u.protocol === 'https:'; } catch { gecerli = false; }
        if (!gecerli) { alanHatasi(g.girdi, 'Yalnız http:// ya da https:// adresi girilebilir.'); ilk = ilk || g.girdi; }
      }
    }
    if (ilk) ilk.focus();
    return !ilk;
  };

  const ciz = () => {
    const baslik = duzenleme ? `Bağlantıyı düzenle: ${duzenleme.ad}` : tur ? `Yeni bağlantı: ${tur.ad}` : 'Yeni bağlantı';
    const parcalar = [h('h3', { id: 'ent-sihirbaz-basligi' }, ikon(tur ? tur.ikon : 'ag'), baslik), adimGostergesi(), mesaj.kutu];
    if (adim === 1) {
      parcalar.push(h('p', { class: 'soluk' }, 'Bağlamak istediğiniz uygulamanın türünü seçin.'),
        h('div', { class: 'entegrasyon-tur-secimi', role: 'list' }, s.turler.map((t) => h('button', {
          type: 'button', role: 'listitem', class: 'entegrasyon-tur-karti', onclick: () => { tur = t; adim = 2; ayarlariKur(); ciz(); }
        }, h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon(t.ikon)), h('b', {}, t.ad), h('small', { class: 'soluk' }, t.aciklama)))),
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', onclick: s.kapat }, 'Vazgeç')));
    } else if (adim === 2) {
      parcalar.push(h('p', { class: 'soluk kucuk' }, tur.aciklama), ayarlarPaneli,
        h('div', { class: 'dugmeler' },
          h('button', { type: 'submit', class: 'birincil' }, 'İleri', ikon('ok')),
          duzenleme ? null : h('button', { type: 'button', onclick: () => { adim = 1; ciz(); } }, ikon('geri'), 'Geri'),
          h('button', { type: 'button', class: 'hayalet', onclick: s.kapat }, 'Vazgeç')));
    } else {
      const sonuc = h('div', { class: 'entegrasyon-deneme', role: 'status' },
        sonDeneme ? [durumRozeti(sonDeneme), h('span', {}, sonDeneme.mesaj)] : [durumRozeti(null), h('span', { class: 'soluk' }, 'İsterseniz kaydetmeden önce deneyin. Deneme yalnız siz basınca ve onay verince gönderilir.')]);
      const dene = h('button', { type: 'button' }, ikon('simsek'), 'Bağlantıyı dene');
      dene.addEventListener('click', async () => {
        mesaj.temizle();
        try {
          const g = istekGovdesi();
          const s2 = await mesgulIken(dene, 'Deneniyor…', () => onayliDene({ projeId: g.projeId, id: g.id, tur: g.tur, alanlar: g.alanlar }));
          if (!s2) return;
          sonDeneme = s2;
          ciz();
        } catch (hata) { mesaj.goster(hata.message); }
      });
      const ozet = h('dl', { class: 'entegrasyon-ozeti' },
        h('dt', {}, 'Tür'), h('dd', {}, tur.ad), h('dt', {}, 'Ad'), h('dd', {}, ad.value.trim()),
        girdiler.map((g) => [h('dt', {}, g.t.etiket), h('dd', {}, g.t.gizli ? (g.oku() || (duzenleme && duzenleme.alanlar[g.t.ad] && duzenleme.alanlar[g.t.ad].dolu) ? '•••••• (gizli)' : '—')
          : g.t.tur === 'onay' ? (g.oku() ? 'Açık' : 'Kapalı')
            : g.t.tur === 'secim' ? ((g.t.secenekler || []).find(([d]) => d === g.oku()) || ['', g.oku()])[1] : String(g.oku() ?? '') || '—')]),
        tur.olaylar.length ? [h('dt', {}, 'Olaylar'), h('dd', {}, olayKutulari.filter(({ k }) => k.checked).map(({ o }) => o.etiket).join(', ') || 'yok')] : null,
        h('dt', {}, 'Durum'), h('dd', {}, etkin.checked ? 'Etkin' : 'Devre dışı'));
      parcalar.push(ozet, sonuc,
        h('div', { class: 'dugmeler' },
          h('button', { type: 'submit', class: 'birincil' }, ikon('onay'), 'Kaydet'), dene,
          h('button', { type: 'button', onclick: () => { adim = 2; ciz(); } }, ikon('geri'), 'Geri'),
          h('button', { type: 'button', class: 'hayalet', onclick: s.kapat }, 'Vazgeç')));
    }
    yerlestir(kap, ...parcalar);
    const ilk = kap.querySelector(adim === 2 ? 'input:not([type="hidden"]), select, textarea' : 'button');
    if (ilk) ilk.focus();
  };

  kap.addEventListener('submit', async (o) => {
    o.preventDefault();
    if (adim === 2) { if (dogrula()) { adim = 3; ciz(); } return; }
    if (adim !== 3) return;
    const dugme = o.submitter || kap.querySelector('button[type="submit"]');
    try {
      await mesgulIken(dugme, 'Kaydediliyor…', () => api('/platform/entegrasyon/kaydet', { govde: { ...istekGovdesi(), sonDeneme: sonDeneme || undefined } }));
      bildir('Bağlantı kaydedildi.');
      s.kaydedildi();
    } catch (hata) { mesaj.goster(hata.message); }
  });
  if (tur) ayarlariKur();
  ciz();
  return kap;
}

// ---------------------------------------------------------------------------------------
// DBeaver bağlantılarını içe aktarma (dosyayı kullanıcı seçer; parolalar alınmaz)
// ---------------------------------------------------------------------------------------

function dbeaverIceAktar(proje, yenile) {
  const dosya = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  document.body.append(dosya);
  dosya.addEventListener('change', async () => {
    const f = dosya.files && dosya.files[0];
    dosya.remove();
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { bildir('Dosya çok büyük (en çok 10 MB).', 'hata'); return; }
    let icerik;
    try {
      icerik = await f.text();
      const { baglantilar } = await api('/platform/entegrasyon/dbeaver/onizle', { govde: { projeId: proje.id, icerik } });
      const kutular = baglantilar.map((b) => ({ b, k: h('input', { type: 'checkbox', id: yeniKimlik('dbv'), value: b.kaynakId, checked: b.destekleniyor, disabled: !b.destekleniyor }) }));
      const ekle = h('button', { type: 'button', class: 'birincil' }, 'Seçilenleri ekle');
      const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
      const m = mesajKutusu();
      const diyalog = diyalogAc('DBeaver bağlantılarını içe aktar',
        'Seçtiğiniz dosyadan yalnız bağlantı adı, veritabanı türü, sunucu, port, veritabanı ve kullanıcı adı alınır. Parolalar ALINMAZ: eklenen her bağlantıya parolayı Düzenle ile siz girin. Eklenen bağlantılar "Yalnız okuma" açık ve denenmemiş olarak başlar.',
        h('div', {}, m.kutu,
          baglantilar.length ? h('ul', { class: 'dbeaver-listesi' }, kutular.map(({ b, k }) => h('li', {},
            h('label', { class: 'secenek', for: k.id }, k, h('span', {}, h('b', {}, b.ad), ' ',
              h('span', { class: 'soluk kucuk' }, b.destekleniyor ? `${b.surucu} · ${b.sunucu}${b.port ? `:${b.port}` : ''}${b.veritabani ? ` / ${b.veritabani}` : ''}${b.kullanici ? ` · ${b.kullanici}` : ''}` : b.neden))))))
            : h('p', { class: 'soluk' }, 'Dosyada bağlantı bulunamadı.'),
          h('div', { class: 'diyalog-alt' }, vazgec, ekle)), 'veri');
      vazgec.addEventListener('click', () => diyalog.close());
      ekle.addEventListener('click', async () => {
        const secilen = kutular.filter(({ k }) => k.checked).map(({ b }) => b.kaynakId);
        if (!secilen.length) { m.goster('En az bir bağlantı seçin.'); return; }
        try {
          const { eklenen } = await mesgulIken(ekle, 'Ekleniyor…', () => api('/platform/entegrasyon/dbeaver/ekle', { govde: { projeId: proje.id, icerik, kaynakIdleri: secilen } }));
          bildir(`${eklenen.length} veritabanı bağlantısı eklendi. Parolalarını Düzenle ile girin.`);
          diyalog.close();
          yenile();
        } catch (hata) { m.goster(hata.message); }
      });
    } catch (hata) { bildir(hata.message || String(hata), 'hata'); }
  });
  bildir('DBeaver\'ın data-sources.json dosyasını seçin (Windows\'ta genellikle %APPDATA%\\DBeaverData\\workspace6\\General\\.dbeaver\\ klasöründe).');
  dosya.click();
}

// ---------------------------------------------------------------------------------------
// Sonuçlar > test ayrıntısı: "Hata kaydı aç"
// ---------------------------------------------------------------------------------------

/**
 * Test ayrıntısındaki "Hata kaydı aç" düğmesi. Yalnız kullanıcı basınca; gönderilecek başlık / açıklama önizlenir, onaylanınca
 * gönderilir. Ekran görüntüsü / video eklemek varsayılan KAPALI.
 * @param {{ id: string }} sonuc @param {{ id: string }} proje
 */
export function hataKaydiDugmesi(sonuc, proje) {
  const dugme = h('button', { type: 'button', class: 'hayalet' }, ikon('hedef'), 'Hata kaydı aç');
  dugme.addEventListener('click', async () => {
    try {
      const { turler, baglantilar } = await mesgulIken(dugme, 'Hazırlanıyor…', () => api(`/platform/entegrasyonlar?projeId=${encodeURIComponent(proje.id)}`));
      const uygun = baglantilar.filter((b) => b.etkin && turler.some((t) => t.tur === b.tur && t.hataKaydi));
      if (!uygun.length) {
        diyalogAc('Hata kaydı aç', 'Bu projede etkin bir iş takip sistemi bağlantısı yok.',
          h('div', { class: 'diyalog-alt' }, h('a', { class: 'dugme birincil', href: '#/ayarlar/entegrasyonlar', onclick: (o) => { const d = o.currentTarget.closest('dialog'); if (d) d.close(); } }, 'Entegrasyonlara git', ikon('ok'))), 'hedef');
        return;
      }
      await hataKaydiDiyalogu(sonuc, proje, uygun);
    } catch (hata) { bildir(hata.message, 'hata'); }
  });
  return dugme;
}

async function hataKaydiDiyalogu(sonuc, proje, baglantilar) {
  const secim = h('select', {}, baglantilar.map((b) => h('option', { value: b.id }, b.ad)));
  const baslik = h('input', { type: 'text', maxlength: '250', autocomplete: 'off' });
  const aciklama = h('textarea', { rows: 12, spellcheck: 'false', class: 'hata-kaydi-aciklamasi' });
  const hedef = h('code', {});
  const gorsel = h('input', { type: 'checkbox', id: yeniKimlik('hk-gorsel') });
  const video = h('input', { type: 'checkbox', id: yeniKimlik('hk-video') });
  const gorselEtiket = h('span', {});
  const videoEtiket = h('span', {});
  const m = mesajKutusu();
  const gonder = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Hata kaydını aç');
  const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
  const govde = h('div', { class: 'hata-kaydi-formu' }, m.kutu,
    baglantilar.length > 1 ? alan('Bağlantı', secim) : null,
    alan('Başlık', baslik, { zorunlu: true }),
    alan('Açıklama', aciklama, { yardim: 'Gönderilmeden önce düzenleyebilirsiniz. Test verisi ya da gizli değer içermediğinden emin olun.' }),
    h('fieldset', {}, h('legend', {}, 'Ekler (isteğe bağlı)'),
      h('label', { class: 'secenek', for: gorsel.id }, gorsel, gorselEtiket),
      h('label', { class: 'secenek', for: video.id }, video, videoEtiket)),
    h('p', { class: 'soluk kucuk' }, '"Hata kaydını aç"a bastığınızda yukarıdaki başlık, açıklama ve seçtiğiniz ekler şu adrese gönderilir: ', hedef),
    h('div', { class: 'diyalog-alt' }, vazgec, gonder));
  const yukle = async () => {
    m.temizle();
    const o = await api('/platform/entegrasyon/hata-kaydi/onizle', { govde: { projeId: proje.id, sonucId: sonuc.id, baglantiId: secim.value } });
    baslik.value = o.baslik;
    aciklama.value = o.aciklama;
    hedef.textContent = o.hedef;
    const gs = o.medya.filter((x) => x.tur === 'ekran_goruntusu').length;
    const vs = o.medya.filter((x) => x.tur === 'video').length;
    gorsel.checked = false;
    video.checked = false;
    gorsel.disabled = !gs;
    video.disabled = !vs;
    gorselEtiket.textContent = `Ekran görüntülerini ekle (${gs})`;
    videoEtiket.textContent = `Videoyu ekle (${vs})`;
  };
  await yukle();
  const diyalog = diyalogAc('Hata kaydı aç', 'Gönderilecek içeriği gözden geçirin. Hiçbir şey siz onaylamadan gönderilmez.', govde, 'hedef');
  secim.addEventListener('change', () => { yukle().catch((h2) => m.goster(h2.message)); });
  vazgec.addEventListener('click', () => diyalog.close());
  gonder.addEventListener('click', async () => {
    m.temizle();
    alanHatasi(baslik, '');
    if (!baslik.value.trim()) { alanHatasi(baslik, 'Başlık boş olamaz.'); baslik.focus(); return; }
    try {
      const r = await mesgulIken(gonder, 'Gönderiliyor…', () => api('/platform/entegrasyon/hata-kaydi/ac', {
        govde: { projeId: proje.id, sonucId: sonuc.id, baglantiId: secim.value, baslik: baslik.value, aciklama: aciklama.value, ekranGoruntuleri: gorsel.checked, video: video.checked, onay: true }
      }));
      yerlestir(govde,
        h('div', { class: 'not-kutusu basari', role: 'status' }, `Hata kaydı açıldı${r.anahtar ? `: ${r.anahtar}` : ''}.`),
        r.adres ? h('p', {}, h('a', { href: r.adres, target: '_blank', rel: 'noopener noreferrer' }, 'Kaydı aç', ikon('ok'))) : null,
        r.uyarilar && r.uyarilar.length ? h('ul', { class: 'not-kutusu uyari' }, r.uyarilar.map((u) => h('li', {}, u))) : null,
        h('div', { class: 'diyalog-alt' }, h('button', { type: 'button', class: 'birincil', onclick: () => diyalog.close() }, 'Kapat')));
      bildir('Hata kaydı açıldı.');
    } catch (hata) { m.goster(hata.message); }
  });
}
