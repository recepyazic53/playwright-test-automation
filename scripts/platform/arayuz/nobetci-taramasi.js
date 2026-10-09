// NÖBETÇİ TARAMASI — Modeli güncelle (modeli olan ekran; #/hizli-test/guncelle/<ekranId>). Hızlı test ekranının düzeniyle (durak şeridi,
// solda iş, sağda "Tarayıcıda şu an"): senaryo seçilir; Nöbetçi önce ekranı keşfeder (seçimler / düğmeler), sonra senaryoyla doldurur;
// okunan ekran modelle karşılaştırılır, farklar Değişiklikler sayfasına düşer. Altta senaryo koşusu kullanılır
// (/platform/senaryolar/calistir, ekranAnalizi: true) ama koşu paneli açılmaz ve koşu "deneme" olarak işaretlenir (Sonuçlar / raporlar
// hesabına girmez). Modeli olmayan ekranın taraması (hızlı test) bundan ayrıdır.
import { TOKEN, api, bildir, h, ikon, rozet, yerlestir } from './ortak.js';
import { adimListesi, canliOnayEki, canliOnayIste, onerilenOrtam } from './kosu-paneli.js';
import { canliGoruntu, kosuYedekKaresi } from './canli-akis.js';

const DURAKLAR = ['Senaryo', 'Keşif', 'Senaryoyla doldurma', 'Sonuç'];
const YOKLAMA_MS = 1500;
const kimlikUret = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** @param {number} etkin 1–4 */
function durakSeridi(etkin) {
  return h('ol', { class: 'basit-adimlar hizli-duraklar', 'aria-label': 'Nöbetçi taraması durakları' },
    DURAKLAR.map((ad, i) => h('li', { class: i + 1 === etkin ? 'etkin' : i + 1 < etkin ? 'gecti' : null, 'aria-current': i + 1 === etkin ? 'step' : null },
      h('span', { class: 'adim-no', 'aria-hidden': 'true' }, String(i + 1)), ad)));
}

/**
 * @param {HTMLElement} icerik @param {{ id: string }} proje @param {string} ekranId
 */
export async function nobetciTaramasiEkrani(icerik, proje, ekranId) {
  const p = encodeURIComponent(proje.id);
  const ekranAdresi = `#/ekranlar/e/${encodeURIComponent(ekranId)}`;
  const baslikMetni = h('h2', { id: 'bolum-basligi', tabindex: '-1' }, 'Nöbetçi taraması');
  const serit = h('div', {});
  const durumSatiri = h('div', { class: 'hizli-durum', role: 'status', 'aria-live': 'polite' });
  const ana = h('div', { class: 'hizli-ana' });
  const yan = h('aside', { class: 'hizli-yan', 'aria-label': 'Tarayıcıda şu an' });
  icerik.replaceChildren(
    h('div', { class: 'sayfa-basligi' }, h('div', {}, baslikMetni,
      h('p', { class: 'soluk' }, 'Nöbetçi önce ekranı keşfeder (seçimleri dener, düğmelere basar; kayıt oluşturan düğmelere basmaz), sonra seçtiğiniz senaryoyla doldurur. Gördüğünü modelle karşılaştırır; farkları Değişiklikler sayfasında kabul ya da reddedersiniz.'))),
    // Senaryo / ortam seçimi kaydedilecek bir form değildir: çıkış koruması saymaz (cikis-korumasi.js > data-kayit-disi).
    h('div', { class: 'hizli-test', 'data-kayit-disi': '' }, serit, durumSatiri, h('div', { class: 'hizli-duzen' }, ana, yan)));
  yerlestir(serit, durakSeridi(1));

  let ekran; let senaryolar; let ortamlar;
  try {
    [ekran, senaryolar, ortamlar] = await Promise.all([
      api(`/platform/ekran?projeId=${p}&id=${encodeURIComponent(ekranId)}`).then((d) => d.ekran),
      api(`/platform/senaryolar?projeId=${p}`).then((y) => (y.senaryolar || []).filter((x) => x.ekranId === ekranId)),
      api(`/platform/ortamlar?projeId=${p}`).then((y) => y.ortamlar || [])
    ]);
  } catch (e) {
    if (e && e.durum === 423) return;
    yerlestir(ana, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message));
    return;
  }
  baslikMetni.textContent = `Nöbetçi taraması: ${ekran.ad}`;
  yerlestir(yan, h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ekran'), 'Tarayıcıda şu an')),
    h('p', { class: 'soluk kucuk' }, 'Tarama başlayınca tarayıcının görüntüsü burada akar.')));
  if (!senaryolar.length) {
    yerlestir(ana, h('section', { class: 'kart' }, h('p', {}, 'Bu ekranın senaryosu yok. Nöbetçi ekranı bir senaryonun verileriyle doldurarak okur; önce bir senaryo ekleyin.'),
      h('div', { class: 'dugmeler' }, h('a', { class: 'dugme', href: ekranAdresi }, 'Ekrana dön'))));
    return;
  }

  // 1) Senaryo ve ortam seçimi.
  const ad = `tarama-senaryo-${kimlikUret()}`;
  const secenekler = senaryolar.map((s, i) => {
    const son = s.sonSonuc?.durum;
    return h('label', { class: 'secim-satiri' }, h('input', { type: 'radio', name: ad, value: s.id, ...(i === 0 ? { checked: true } : {}) }),
      h('span', {}, s.baslik), son ? rozet(son === 'basarili' ? 'son koşu başarılı' : 'son koşu başarısız', son === 'basarili' ? 'basari' : 'hata') : null);
  });
  const ortamSecimi = h('select', { 'aria-label': 'Ortam' });
  const ortamlariDoldur = () => {
    const sid = /** @type {HTMLInputElement | null} */ (ana.querySelector(`input[name="${ad}"]:checked`))?.value;
    const s = senaryolar.find((x) => x.id === sid);
    const tanimli = ortamlar.filter((o) => (s?.ortamlar || []).some((x) => x.ortamId === o.id && x.tanimli));
    const liste = tanimli.length ? tanimli : ortamlar;
    const oneri = onerilenOrtam(liste);
    ortamSecimi.replaceChildren(...liste.map((o) => h('option', { value: o.id, ...(oneri && o.id === oneri.id ? { selected: true } : {}) }, o.ad)));
  };
  const baslat = h('button', { type: 'button', class: 'birincil' }, ikon('oynat'), 'Taramayı başlat');
  yerlestir(ana, h('section', { class: 'kart' },
    h('div', { class: 'kart-basligi' }, h('h3', { 'data-odak': '', tabindex: '-1' }, ikon('liste'), 'Hangi senaryoyla dolduralım?')),
    h('p', { class: 'soluk kucuk' }, 'Senaryo yalnız ekrana veri girmek için kullanılır; ekranın kendi adımları bitince durulur (ödeme / poliçeleştirme yapılmaz). Senaryo hata verirse o ana kadar okunanlar karşılaştırılır.'),
    h('div', { class: 'secim-listesi', role: 'radiogroup', 'aria-label': 'Senaryo' }, secenekler),
    h('label', { class: 'alan' }, h('span', {}, 'Ortam'), ortamSecimi),
    h('div', { class: 'dugmeler' }, baslat, h('a', { class: 'dugme hayalet', href: ekranAdresi }, 'Vazgeç'))));
  ortamlariDoldur();
  ana.addEventListener('change', (olay) => { if (olay.target instanceof HTMLInputElement && olay.target.name === ad) ortamlariDoldur(); });
  baslat.addEventListener('click', async () => {
    const sid = /** @type {HTMLInputElement | null} */ (ana.querySelector(`input[name="${ad}"]:checked`))?.value;
    const senaryo = senaryolar.find((x) => x.id === sid);
    const ortam = ortamlar.find((o) => o.id === ortamSecimi.value);
    if (!senaryo || !ortam) { bildir('Senaryo ve ortam seçin.', 'hata'); return; }
    if (!(await canliOnayIste(ortam))) return;
    calistir(senaryo, ortam);
  });

  // 2–4) Tarama: keşif → senaryo → sonuç.
  /** @param {any} senaryo @param {any} ortam */
  const calistir = (senaryo, ortam) => {
    const kosuId = kimlikUret();
    let bitti = false;
    /** @type {any[]} */
    let adimlar = [];
    const adimKap = h('div', {});
    const asama = h('p', { class: 'hizli-asama' });
    const durdur = h('button', { type: 'button', class: 'tehlike' }, h('span', { class: 'kare-simge', 'aria-hidden': 'true' }), 'Taramayı durdur');
    durdur.addEventListener('click', async () => {
      durdur.disabled = true;
      try { await api('/durdur', { govde: { kosuId } }); } catch (e) { bildir(e.message, 'hata'); durdur.disabled = false; }
    });
    yerlestir(ana, h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ara'), 'Ekran inceleniyor'), h('span', { class: 'sag' }, rozet(ortam.ad))),
      h('p', { class: 'soluk kucuk' }, senaryo.baslik), asama, adimKap, h('div', { class: 'dugmeler' }, durdur)));
    const canli = canliGoruntu({
      akisAdresi: `/canli-akis?kosuId=${encodeURIComponent(kosuId)}`, tamSayfaAdresi: `/canli-tam-sayfa?kosuId=${encodeURIComponent(kosuId)}`,
      etiket: `Nöbetçi taraması: ${ekran.ad} (canlı)`, yedekKareAl: () => kosuYedekKaresi(kosuId),
      tarayiciyiGoster: async () => {
        const y = await api('/tarayiciyi-goster', { govde: { kosuId } }).catch((e) => ({ basarili: false, mesaj: e.message }));
        return { basarili: Boolean(y.basarili), mesaj: String(y.mesaj || '') };
      }
    });
    yerlestir(yan, h('section', { class: 'kart' }, h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('ekran'), 'Tarayıcıda şu an'),
      h('span', { class: 'sag' }, rozet(ortam.ad))), canli.el));
    const asamayiYaz = () => {
      const kesif = adimlar.find((a) => /^Ekran keşfi/.test(a.ad));
      const durak = bitti ? 4 : kesif && kesif.durum !== 'calisiyor' ? 3 : 2;
      yerlestir(serit, durakSeridi(durak));
      const metin = bitti ? 'Karşılaştırma bitti.' : durak === 2 ? (kesif ? 'Keşif: seçimler deneniyor, düğmelere basılıyor (birkaç dakika sürebilir)…' : 'Giriş yapılıyor, ekran açılıyor…')
        : 'Senaryoyla dolduruluyor; her adımda ekran okunuyor…';
      asama.textContent = metin;
      if (durumSatiri.textContent !== metin) durumSatiri.textContent = metin;
    };
    const yokla = async () => {
      if (bitti || !ana.isConnected) return;
      try {
        const y = await fetch(`/adim-durumu?kosuId=${encodeURIComponent(kosuId)}`, { headers: { 'X-Test-Sunucu-Token': TOKEN }, cache: 'no-store' }).then((r) => r.json());
        if (Array.isArray(y.adimlar)) { adimlar = y.adimlar; yerlestir(adimKap, adimListesi(adimlar, true)); }
      } catch { /* bir sonraki yoklamada */ }
      asamayiYaz();
      if (!bitti && ana.isConnected) setTimeout(yokla, YOKLAMA_MS);
    };
    asamayiYaz();
    void yokla();
    api('/platform/senaryolar/calistir', {
      govde: { projeId: proje.id, ortamId: ortam.id, senaryoId: senaryo.id, kosuId, kosuTuru: 'tekil', kosuKimligi: `tarama-${kimlikUret()}`, tekBasina: true, ekranAnalizi: true, ...canliOnayEki(ortam.id) }
    }).catch((e) => ({ basarili: false, mesaj: e.message })).then((yanit) => {
      bitti = true;
      canli.durdur();
      asamayiYaz();
      if (ana.isConnected) sonucuCiz(yanit, senaryo);
    });
  };

  /** @param {any} yanit @param {any} senaryo */
  const sonucuCiz = (yanit, senaryo) => {
    const a = yanit && yanit.ekranAnalizi;
    const senaryoDurumu = yanit?.durum === 'passed' ? null
      : yanit?.durum === 'iptal' ? 'Tarama durduruldu; o ana kadar okunanlar karşılaştırıldı.'
        : yanit?.basarili === false ? `Tarama başlatılamadı: ${yanit.mesaj || 'bilinmeyen hata'}`
          : `Senaryo ${yanit?.basarisizAdim ? `“${yanit.basarisizAdim}” adımında ` : ''}durdu; o ana kadar okunanlar karşılaştırıldı.`;
    const hata = a ? null : yanit?.ekranAnaliziHatasi ? `Ekran karşılaştırılamadı: ${yanit.ekranAnaliziHatasi}` : yanit?.basarili === false ? null : 'Ekran karşılaştırılamadı: tarama ekrana ulaşamadı.';
    const notlar = a && Array.isArray(a.notlar) ? a.notlar : [];
    const git = a?.bulguSayisi ? h('a', { class: 'dugme birincil', href: `${ekranAdresi}/bulgular` }, 'Değişiklikleri gör', ikon('ok')) : null;
    yerlestir(ana, h('section', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', { 'data-odak': '', tabindex: '-1' }, ikon(a?.bulguSayisi ? 'uyari' : 'onay'), 'Sonuç')),
      hata ? h('p', { class: 'hata-metni' }, hata) : a ? h('p', {}, a.bulguSayisi
        ? `Ekranda modelden farklı ${a.bulguSayisi} şey bulundu (yeni / kaybolan alan, yeni / kaldırılan seçenek). Değişiklikler sayfasında tek tek kabul edin ya da reddedin.`
        : 'Ekranda modelden farklı bir alan ya da seçenek bulunmadı.') : null,
      a?.gizlenenSayisi ? h('p', { class: 'soluk' }, `Daha önce reddettiğiniz ${a.gizlenenSayisi} fark yeniden gösterilmedi.`) : null,
      senaryoDurumu ? h('p', { class: 'soluk kucuk' }, senaryoDurumu) : null,
      notlar.length ? h('ul', { class: 'kucuk' }, notlar.map((n) => h('li', {}, n))) : null,
      h('p', { class: 'soluk kucuk' }, `Senaryo: ${senaryo.baslik}`),
      h('div', { class: 'dugmeler' }, git, h('a', { class: `dugme${git ? ' hayalet' : ''}`, href: ekranAdresi }, 'Ekrana dön'))));
    /** @type {HTMLElement | null} */ (ana.querySelector('[data-odak]'))?.focus();
  };
}
