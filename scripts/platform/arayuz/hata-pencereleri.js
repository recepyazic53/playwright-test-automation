// AYARLAR > HATA PENCERELERİ (proje başına; sunucu: scripts/platform/ayarlar/hata-pencereleri.mjs). Sitenin hata / uyarı mesajını
// gösterdiği pencereler: koşu bir adımı beklerken önce adımın kendi göstergelerine bakar; onlar bir şey söylemiyorken bu pencerelerden
// biri görünürse adım beklemeden başarısız olur, metni hata iletisine yazılır (yazısından bağımsız). Pencere "Sayfada seç" ile sayfada
// tıklanarak tanımlanır (seçiciyi Nöbetçi üretir, küçük ekran görüntüsü listede gösterilir) ya da ileri düzeyde seçici elle yazılır.
// Kullanıcı verisi DOM'a yalnız metin olarak yazılır (h()); satır içi stil yok (CSP).
import { alan, api, bildir, bosDurum, h, ikon, mesgulIken, rozet, yerlestir } from './ortak.js';
import { ortamSecenekMetni } from './kosu-paneli.js';
import { ogeSecmeKarti } from './oge-secme.js';

/**
 * @param {HTMLElement} govde
 * @param {{ durum: { proje: { id: string; ad: string } | null } }} baglam
 */
export async function hataPencereleriSayfasi(govde, baglam) {
  const proje = baglam.durum.proje;
  if (!proje) { yerlestir(govde, bosDurum('Proje seçilmedi.', 'Önce bir proje seçin.')); return; }
  const [v, sec] = await Promise.all([
    api(`/platform/hata-pencereleri?projeId=${encodeURIComponent(proje.id)}`),
    api(`/platform/tarama/secenekler?projeId=${encodeURIComponent(proje.id)}`)
  ]);
  /** @type {Array<{ id?: string; ad: string; secici: string; cerceve?: string[]; goruntu?: string; etkin: boolean }>} */
  let pencereler = v.pencereler;
  const enCok = v.enCok;
  const ortamlar = sec.ortamlar || [];

  const liste = h('div', { class: 'hata-pencere-listesi' });
  const durum = h('p', { class: 'soluk kucuk', role: 'status' });

  /** Listeyi sunucuya yazar (tümü); başarısızsa eski liste geri gelir. */
  const kaydet = async (yeni, dugme, mesaj) => {
    const r = await (dugme ? mesgulIken(dugme, 'Kaydediliyor…', () => api('/platform/hata-pencereleri/kaydet', { govde: { projeId: proje.id, pencereler: yeni } }))
      : api('/platform/hata-pencereleri/kaydet', { govde: { projeId: proje.id, pencereler: yeni } }));
    pencereler = r.pencereler;
    if (mesaj) bildir(mesaj);
    ciz();
  };
  const hataylaKaydet = (yeni, dugme, mesaj) => kaydet(yeni, dugme, mesaj).catch((e) => { if (e.durum !== 423) bildir(e.message, 'hata'); });

  function ciz() {
    durum.textContent = `${pencereler.length} / ${enCok} pencere`;
    yerlestir(liste, pencereler.length ? h('ul', { class: 'hata-pencereleri', 'aria-label': 'Hata pencereleri' }, pencereler.map((p, i) => {
      const ad = h('input', { type: 'text', value: p.ad, maxlength: '80', 'aria-label': 'Pencerenin adı' });
      ad.addEventListener('change', () => { if (ad.value.trim() && ad.value.trim() !== p.ad) void hataylaKaydet(pencereler.map((x, j) => (j === i ? { ...x, ad: ad.value.trim() } : x)), null, 'Ad kaydedildi.'); });
      const etkin = h('input', { type: 'checkbox', checked: p.etkin || null, 'aria-label': `${p.ad}: koşularda kullanılsın` });
      etkin.addEventListener('change', () => { void hataylaKaydet(pencereler.map((x, j) => (j === i ? { ...x, etkin: etkin.checked } : x)), null, etkin.checked ? 'Açıldı.' : 'Kapatıldı: koşularda kullanılmaz.'); });
      const sil = h('button', { type: 'button', class: 'kucuk-dugme hayalet tehlike', 'aria-label': `${p.ad}: sil` }, ikon('cop'), 'Sil');
      sil.addEventListener('click', () => { void hataylaKaydet(pencereler.filter((_, j) => j !== i), sil, 'Silindi.'); });
      return h('li', { class: `hata-penceresi${p.etkin ? '' : ' kapali'}` },
        p.goruntu ? h('img', { class: 'hata-penceresi-gorsel', src: p.goruntu, alt: `${p.ad} görüntüsü` }) : h('div', { class: 'hata-penceresi-gorsel bos', 'aria-hidden': 'true' }, ikon('uyari')),
        h('div', { class: 'hata-penceresi-bilgi' },
          ad,
          h('small', { class: 'soluk' }, h('code', { class: 'duz' }, p.secici), p.cerceve && p.cerceve.length ? ` · çerçeve: ${p.cerceve.join(' › ')}` : ''),
          h('label', { class: 'onay-satiri kucuk' }, etkin, h('span', {}, 'Koşularda kullanılsın')),
          p.etkin ? null : rozet('kapalı', 'durdu')),
        sil);
    })) : bosDurum('Henüz hata penceresi yok.', 'Sitenin hata / uyarı penceresini aşağıdaki "Sayfada seç" ile tanımlayın.'));
  }

  // --- Sayfada seç ile ekle -----------------------------------------------------------------
  const ilk = ortamlar.find((o) => o.varsayilan) || ortamlar.find((o) => !o.canli) || ortamlar[0];
  const ortamSecimi = h('select', {}, ortamlar.map((o) => h('option', { value: o.id, selected: ilk && o.id === ilk.id || null }, ortamSecenekMetni(o))));
  const hedef = h('input', { type: 'text', value: '/', placeholder: '/satis/odeme/', spellcheck: 'false', autocomplete: 'off' });
  const ekle = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('artiYalin'), 'Seçilenleri ekle');
  const secme = ogeSecmeKarti({
    proje, turler: ['hata'], dugmeMetni: 'Sayfada seç',
    degisti: () => { ekle.disabled = !secme.ogeler().length; },
    hedef: () => {
      const o = ortamlar.find((x) => x.id === ortamSecimi.value);
      if (!o) return 'Ortamı seçin.';
      if (!hedef.value.trim()) return 'Açılacak sayfanın yolunu yazın (ör. /).';
      return { ortam: o, hedef: hedef.value.trim(), girissiz: false, ekranAdi: 'Hata penceresi' };
    }
  });
  ekle.addEventListener('click', () => {
    const yeni = secme.ogeler().filter((o) => !pencereler.some((p) => p.secici === o.secici && JSON.stringify(p.cerceve || []) === JSON.stringify(o.cerceve || [])))
      .map((o, i) => ({ ad: `Hata penceresi ${pencereler.length + i + 1}`, secici: o.secici, ...(o.cerceve ? { cerceve: o.cerceve } : {}), ...(o.goruntu ? { goruntu: o.goruntu } : {}), etkin: true }));
    if (!yeni.length) { bildir('Seçilen pencereler listede zaten var.', 'hata'); return; }
    void hataylaKaydet([...pencereler, ...yeni], ekle, `${yeni.length} pencere eklendi.`);
  });

  // --- Elle ekle (ileri düzey) -------------------------------------------------------------------
  const elleAd = h('input', { type: 'text', maxlength: '80', placeholder: 'ör. Uyarı kutusu' });
  const elleSecici = h('input', { type: 'text', maxlength: '300', placeholder: '#dialog-content', spellcheck: 'false' });
  const elleEkle = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('artiYalin'), 'Ekle');
  elleEkle.addEventListener('click', () => {
    if (!elleSecici.value.trim()) { bildir('Seçiciyi yazın.', 'hata'); return; }
    void hataylaKaydet([...pencereler, { ad: elleAd.value.trim() || `Hata penceresi ${pencereler.length + 1}`, secici: elleSecici.value.trim(), etkin: true }], elleEkle, 'Pencere eklendi.')
      .then(() => { elleAd.value = ''; elleSecici.value = ''; });
  });

  yerlestir(govde,
    h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('uyari'), 'Tanımlı pencereler'), durum),
      h('p', { class: 'soluk kucuk' }, 'Koşu bir adımı beklerken önce ekranın kendi göstergelerine ve senaryonun beklenen uyarısına bakar. Onlar bir şey söylemiyorken buradaki pencerelerden biri görünürse adım beklemeden başarısız olur; pencerenin metni hata iletisine yazılır. İçindeki yazı önemli değildir.'),
      liste),
    h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('hedef'), 'Sayfada seç ile ekle')),
      h('p', { class: 'soluk kucuk' }, 'Sayfayı açın; "Öğe seç" kapalıyken siteyi kullanarak pencerenin çıktığı yere gidin, sonra "Öğe seç"i açıp pencerenin kutusuna tıklayın. Nöbetçi seçiciyi üretir ve pencerenin küçük bir görüntüsünü alır (görüntü yalnız bu listede gösterilir).'),
      h('div', { class: 'tarama-ikili' }, alan('Ortam', ortamSecimi), alan('Açılacak sayfa', hedef, { yardim: 'Ortam adresine göre yol.' })),
      secme.kart,
      h('div', { class: 'dugmeler' }, ekle)),
    h('details', { class: 'kart' },
      h('summary', {}, 'Seçiciyi elle ekle (ileri düzey)'),
      h('div', { class: 'tarama-ikili' }, alan('Ad', elleAd), alan('Seçici (CSS)', elleSecici)),
      h('div', { class: 'dugmeler' }, elleEkle)));
  ciz();
}
