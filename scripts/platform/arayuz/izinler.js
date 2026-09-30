// Ayarlar > İzinler — Nöbetçi'nin sizin adınıza yapabileceği işlemlerin açık / kapalı anahtarları (varsayılan KAPALI).
// Tüm metinler izin tanımlarından gelir (izin-tanimlari.mjs; sunucuyla ortak tek kaynak): başlık, açıklama, "?" açıklaması
// (neler yapabilir, nerelerde, hangi işlemlerde, riski ve kapalıyken), açma onayı ve kapalı izin uyarısı. Açmak kısa bir onay
// penceresi ister (ne yapar / riski); kapatmak serbesttir. Değişiklikler kasada saklanır ve "Son değişiklikler"de görünür.
// Kullanıcı verisi DOM'a yalnızca metin olarak yazılır (h(); innerHTML yok).
import { api, bildir, h, ikon, mesajKutusu, mesgulIken, rozet, tarihMetni } from './ortak.js';
import { IZIN_TANIMLARI } from './izin-tanimlari.mjs';
import { CANLI_IZNI, PAKET_DISI_IZINLER, paketIzinleri } from './izin-paketleri.mjs';

let sayac = 0;

/**
 * Ayarlar > İzinler listesinin bölümleri (yalnız sunum; izin verisi ve sunucu sözleşmesi değişmez): her bölüm kendi başlığı altında
 * ne için gerektiğini söyler. Listede olmayan (ileride eklenen) izinler son bölümde görünür.
 * @type {ReadonlyArray<{ ad: string; baslik: string; aciklama: string; izinler: readonly string[]; canli?: boolean }>}
 */
const IZIN_BOLUMLERI = Object.freeze([
  { ad: 'test', baslik: 'Test ortamlarında', aciklama: 'Test ortamındaki ekran ve servis testleri için gereken izinler.', izinler: Object.freeze(['web-erisimi', 'servis-istekleri', 'giris-bilgisi', 'veritabani-okuma']) },
  { ad: 'canli', baslik: 'Canlı ortamda', aciklama: 'Dikkat: canlı ortam gerçek kullanıcıların verisini etkileyebilir. Bu izin kapalıyken Nöbetçi canlı ortama hiçbir istek atmaz; açıkken de her işlemden önce ayrıca "CANLI ortam — emin misiniz?" diye sorulur.', izinler: Object.freeze([CANLI_IZNI]), canli: true },
  { ad: 'kalici', baslik: 'Kalıcı değişiklik ve güvenlik', aciklama: 'Veriyi kalıcı değiştiren ya da güvenliği gevşeten izinler; hiçbir hazır seçime girmez, yalnız buradan tek tek açılır.', izinler: Object.freeze([...PAKET_DISI_IZINLER]) },
  { ad: 'diger', baslik: 'Bildirim ve arka plan', aciklama: 'Nöbetçi dışına bildirim gönderen ve siz yokken çalışan işlemler.', izinler: Object.freeze(['dis-gonderim', 'arka-plan']) }
]);

/**
 * "Nöbetçi sizin adınıza neleri yapabilsin?" — izin paketi seçimi (ilk kurulum sihirbazı ve Ayarlar > İzinler). İki ayrı bölüm:
 * "Test ortamlarında neler yapılabilsin?" (Hiçbir izin açma / Ekran ve servis testleri / … + veritabanı okuma / Kendim seçeyim; her
 * seçeneğin altında tek cümle) ve ayrı, uyarılı "Canlı ortamda neler yapılabilsin?" ("Canlı ortamda da çalıştırmaya izin ver" kutusu;
 * varsayılan işaretsiz; işaretlenince açık risk uyarısı). Seçimin açacağı izinler riskleriyle tek listede görünür; düğme tek
 * onaydır (sunucu: /platform/izin/paket-uygula; açılan her izin geçmişe yazılır). Paket hiçbir izni kapatmaz; veritabanına yazma,
 * sistem değişikliği ve güvenlik gevşetme listede "pakete girmez" olarak yazar.
 * @param {{ izinler: Record<string, boolean>; baslik?: string; dugmeMetni?: (n: number) => string; bosDugmeMetni?: string | null;
 *   ekDugmeler?: Node[]; bitti: (r: { izinler: Record<string, boolean>; acilanlar: string[]; degisiklikler?: any[] }) => void }} s
 *   bosDugmeMetni: açılacak izin yokken düğmenin metni (null: düğme kapalı kalır)
 */
export function izinPaketiSecimi(s) {
  const no = ++sayac;
  const ad = `izin-paketi-${no}`;
  const mesaj = mesajKutusu();
  let izinler = { ...s.izinler };
  // İşler: kayıt sihirbazındaki "İşleriniz" adımıyla aynı iki seçim (birini ya da ikisini seçin; hiçbiri = izin açma).
  const ISLER = [
    { ad: 'ekran', etiket: 'Ekran testleri', aciklama: 'Web sayfalarını açar, alanları doldurur ve sonucu doğrular.', izinler: ['web-erisimi', 'giris-bilgisi'] },
    { ad: 'servis', etiket: 'Servis testleri', aciklama: 'Servislere istek gönderir ve yanıtı doğrular.', izinler: ['servis-istekleri'] }
  ];
  const isKutulari = ISLER.map((is) => {
    const girdi = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id: `${ad}-is-${is.ad}`, value: is.ad }));
    return { is, girdi, etiket: h('label', { class: 'profil-secenegi', for: girdi.id }, girdi, h('span', {}, h('b', {}, is.etiket), h('small', { class: 'soluk' }, is.aciklama))) };
  });
  const canli = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', id: `${ad}-canli` }));
  const canliTanimi = IZIN_TANIMLARI.find((x) => x.anahtar === CANLI_IZNI);
  const canliUyarisi = h('div', { class: 'not-kutusu hata izin-paketi-canli-uyarisi', role: 'note', hidden: true },
    h('p', {}, h('strong', {}, 'Risk: '), canliTanimi ? canliTanimi.risk : ''),
    h('p', {}, 'Canlı ortamdaki her işlemden önce sorulan "CANLI ortam — emin misiniz?" onayı aynen kalır; bu kutu o onayı kaldırmaz.'));
  const canliKutusu = h('fieldset', { class: 'izin-paketi-bolumu izin-paketi-canli-bolumu' },
    h('legend', {}, ikon('uyari'), 'Canlı ortamda neler yapılabilsin?'),
    h('p', { class: 'kucuk izin-risk' }, h('b', {}, 'Dikkat: '), 'canlı ortam gerçek kullanıcıların verisini etkileyebilir; bu yüzden ayrı tutulur ve varsayılan olarak kapalıdır.'),
    h('div', { class: 'alan onay-alani izin-paketi-canli' }, h('label', { class: 'secenek', for: canli.id }, canli, 'Canlı ortamda da çalıştırmaya izin ver'),
      h('div', { class: 'yardim' }, 'İşaretlerseniz "Canlı ortamda çalıştırma" izni de açılır; işaretlemezseniz Nöbetçi canlı ortama hiçbir istek atmaz.')),
    canliUyarisi);
  const liste = h('ul', { class: 'izin-paketi-listesi', 'aria-label': 'Açılacak izinler' });
  const dugme = h('button', { type: 'button', class: 'birincil' });
  const secim = () => ({
    paket: 'ozel', canli: canli.checked,
    ozel: isKutulari.filter((k) => k.girdi.checked).flatMap((k) => k.is.izinler).filter((x, i, d) => d.indexOf(x) === i)
  });
  const ciz = () => {
    const sec = secim();
    canliUyarisi.hidden = !sec.canli;
    const istenen = paketIzinleri(sec);
    const acilacak = istenen.filter((a) => izinler[a] !== true);
    liste.replaceChildren(...[
      ...istenen.map((a) => {
        const t = IZIN_TANIMLARI.find((x) => x.anahtar === a);
        const acik = izinler[a] === true;
        return h('li', { class: `izin-paketi-satiri${a === CANLI_IZNI ? ' canli' : ''}`, 'data-izin': a },
          h('span', { class: 'izin-paketi-isaret', 'aria-hidden': 'true' }, ikon(acik ? 'onay' : 'kilit')),
          h('span', { class: 'izin-paketi-metni' }, h('b', {}, t ? t.etiket : a), acik ? h('span', { class: 'soluk kucuk' }, ' (zaten açık)') : null,
            h('span', { class: 'kucuk izin-risk' }, ' risk: ', t ? t.risk : '')));
      }),
      istenen.length ? null : h('li', { class: 'soluk kucuk' }, 'Hiçbir izin açılmaz: izne bağlı her işlemde "Bu işlem için … iznini açmalısınız" uyarısı çıkar ve izni orada tek tek açarsınız.'),
      h('li', { class: 'izin-paketi-disi kucuk' }, ikon('carpi'), ' Pakete girmez, her zaman tek tek açılır: ',
        PAKET_DISI_IZINLER.map((a) => IZIN_TANIMLARI.find((x) => x.anahtar === a)?.etiket || a).join(', '), '.')
    ].filter(Boolean));
    dugme.textContent = acilacak.length ? (s.dugmeMetni ? s.dugmeMetni(acilacak.length) : `Bu ${acilacak.length} izni aç`) : (s.bosDugmeMetni || 'Açılacak izin yok');
    dugme.disabled = !acilacak.length && !s.bosDugmeMetni;
  };
  for (const k of isKutulari) k.girdi.addEventListener('change', ciz);
  canli.addEventListener('change', ciz);
  dugme.addEventListener('click', async () => {
    mesaj.temizle();
    const sec = secim();
    const acilacak = paketIzinleri(sec).filter((a) => izinler[a] !== true);
    if (!acilacak.length) { s.bitti({ izinler, acilanlar: [] }); return; }
    try {
      // Düğme tek onaydır: açılacak izinler ve riskleri hemen üstte listelenir.
      const r = await mesgulIken(dugme, 'Açılıyor…', () => api('/platform/izin/paket-uygula', { govde: { ...sec, onay: true } }));
      izinler = { ...r.izinler };
      bildir(`${r.acilanlar.length} izin açıldı.`);
      ciz();
      s.bitti(r);
    } catch (hata) { mesaj.goster(hata.message); }
  });
  ciz();
  const kok = h('section', { class: 'kart izin-paketi', 'aria-label': 'İzin paketi' },
    h('h3', {}, ikon('kalkan'), s.baslik || 'Nöbetçi sizin adınıza neleri yapabilsin?'),
    h('p', { class: 'soluk kucuk' }, 'Önce test ortamlarında, sonra canlı ortamda neler yapılabileceğini seçin; açılacak izinler riskleriyle aşağıda listelenir ve tek onayla açılır. Seçim hiçbir izni kapatmaz; izinleri istediğiniz an Ayarlar > İzinler\'den tek tek açıp kapatabilirsiniz.'),
    mesaj.kutu,
    h('fieldset', { class: 'profil-secimi izin-paketi-bolumu' }, h('legend', {}, 'Test ortamlarında neler yapılabilsin? (birini ya da ikisini seçin)'), h('div', { class: 'profil-secenekleri' }, isKutulari.map((k) => k.etiket))),
    canliKutusu,
    h('h4', {}, 'Açılacak izinler'), liste,
    h('div', { class: 'dugmeler' }, ...(s.ekDugmeler || []), dugme));
  /** İzinler başka yerden (tek tek) değişince listeyi tazeler. @param {Record<string, boolean>} yeni */
  kok.izinleriGuncelle = (yeni) => { izinler = { ...yeni }; ciz(); };
  return kok;
}

/** "?" açıklamasının gövdesi (tanımdan). @param {import('./izin-tanimlari.mjs').IzinTanimi} t */
function aciklamaGovdesi(t) {
  const liste = (/** @type {readonly string[]} */ ogeler) => h('ul', {}, ogeler.map((x) => h('li', {}, x)));
  return [
    h('h4', {}, 'Bu izin neler yapabilir?'), liste(t.yapabilecekleri),
    h('h4', {}, 'Nerelerde kullanılır?'), liste(t.yerler),
    h('h4', {}, 'Hangi işlemlerde kullanılır?'),
    h('ul', { class: 'izin-islemleri' }, t.islemler.map((i) => h('li', {}, i.ad, i.kosul ? h('small', { class: 'soluk' }, ` (${i.kosul})`) : null))),
    h('h4', {}, 'Riski'), h('p', {}, t.risk),
    h('h4', {}, 'Kapalıyken'), h('p', {}, t.kapaliyken)
  ];
}

/**
 * Tek izin satırı: başlık + "?" (tıklanır / klavye; Esc kapatır) + anahtar.
 * @param {import('./izin-tanimlari.mjs').IzinTanimi} t @param {boolean} acik @param {(anahtar: string, acik: boolean) => Promise<boolean>} degistir
 */
function izinSatiri(t, acik, degistir) {
  const no = ++sayac;
  const panelId = `izin-aciklama-${no}`;
  const anahtarId = `izin-anahtar-${no}`;
  const soru = h('button', {
    type: 'button', class: 'ikon-dugme izin-soru', 'aria-expanded': 'false', 'aria-controls': panelId,
    'aria-label': `"${t.etiket}" izni ne yapar?`, title: 'Bu izin ne yapar?'
  }, ikon('soru'));
  const panel = h('div', { id: panelId, class: 'izin-aciklama', role: 'region', 'aria-label': `${t.etiket}: açıklama`, hidden: true }, aciklamaGovdesi(t));
  const ac = (/** @type {boolean} */ goster) => {
    panel.hidden = !goster;
    soru.setAttribute('aria-expanded', String(goster));
  };
  soru.addEventListener('click', () => ac(panel.hidden));
  const escKapat = (/** @type {KeyboardEvent} */ o) => {
    if (o.key === 'Escape' && !panel.hidden) { o.preventDefault(); o.stopPropagation(); ac(false); soru.focus(); }
  };
  soru.addEventListener('keydown', escKapat);
  panel.addEventListener('keydown', escKapat);

  const girdi = h('input', { type: 'checkbox', id: anahtarId, role: 'switch', class: 'anahtar izin-anahtari', checked: acik, 'aria-describedby': `${panelId}-kisa` });
  const durum = rozet(acik ? 'Açık' : 'Kapalı', acik ? 'uyari' : '');
  const satir = h('li', { class: `izin-satiri ${acik ? 'acik' : ''}`, 'data-izin': t.anahtar },
    h('div', { class: 'izin-ust' },
      h('label', { class: 'izin-baslik', for: anahtarId }, ikon(acik ? 'kilit' : 'kalkan'), h('span', {}, t.etiket)),
      soru,
      h('span', { class: 'bosluk' }),
      durum,
      h('span', { class: 'anahtar-kap' }, girdi)),
    h('p', { class: 'soluk kucuk', id: `${panelId}-kisa` }, t.aciklama),
    h('p', { class: 'kucuk izin-risk' }, h('b', {}, 'Risk: '), t.risk),
    panel);
  girdi.addEventListener('change', async () => {
    const yeni = girdi.checked;
    girdi.disabled = true;
    const tamam = await degistir(t.anahtar, yeni).catch(() => false);
    girdi.disabled = false;
    if (!tamam) girdi.checked = !yeni;
  });
  return satir;
}

/**
 * Açma onayı: ne yapar / riski (tanımdan). @param {import('./izin-tanimlari.mjs').IzinTanimi} t @returns {Promise<boolean>}
 */
function acmaOnayi(t) {
  return new Promise((coz) => {
    const ac = h('button', { type: 'button', class: 'birincil' }, 'İzni aç');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const diyalog = h('dialog', { class: 'onay-diyalogu izin-onayi', 'aria-labelledby': 'izin-onay-basligi' },
      h('div', { class: 'diyalog-govde' },
        h('h2', { id: 'izin-onay-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('uyari')), `"${t.etiket}" izni açılsın mı?`),
        h('p', {}, t.aciklama),
        h('h4', {}, 'Ne yapar?'), h('ul', { class: 'onay-listesi' }, t.yapabilecekleri.map((x) => h('li', {}, x))),
        h('div', { class: 'not-kutusu hata', role: 'note' }, h('strong', {}, 'Riski: '), t.risk),
        h('p', { class: 'soluk kucuk' }, 'İzni istediğiniz an kapatabilirsiniz. Mevcut işlem onayları (ör. canlı ortam onayı) izin açıkken de sorulur.')),
      h('div', { class: 'diyalog-alt' }, vazgec, ac));
    let sonuc = false;
    ac.addEventListener('click', () => { sonuc = true; diyalog.close(); });
    vazgec.addEventListener('click', () => diyalog.close());
    diyalog.addEventListener('close', () => { diyalog.remove(); coz(sonuc); });
    document.body.append(diyalog);
    diyalog.showModal();
    vazgec.focus();
  });
}

/** Son değişiklikler listesi. @param {any[]} kayitlar @param {Record<string, string>} makineler */
function degisiklikListesi(kayitlar, makineler) {
  if (!kayitlar.length) return h('p', { class: 'soluk kucuk' }, 'Henüz izin değişikliği yok. Tüm izinler kapalı başlar.');
  return h('ul', { class: 'izin-gecmisi' }, kayitlar.map((k) => {
    const at = k.yapan.indexOf('@');
    const yapan = at > 0 && makineler[k.yapan.slice(at + 1)] ? `${k.yapan.slice(0, at)} (${makineler[k.yapan.slice(at + 1)]})` : k.yapan;
    return h('li', {}, h('time', { datetime: k.zaman }, tarihMetni(k.zaman)), ' · ', h('b', {}, k.etiket), ' ',
      rozet(k.acik ? 'açıldı' : 'kapatıldı', k.acik ? 'uyari' : ''), h('span', { class: 'soluk' }, ` · ${yapan}`));
  }));
}

/**
 * Ayarlar > İzinler bölümü. baglam.odak: adresle gelen izin (#/ayarlar/izinler/<anahtar>) — satırına kaydırılır ve anahtar odaklanır.
 * @param {HTMLElement} govde @param {{ odak?: string | null }} baglam
 */
export async function izinlerBolumu(govde, baglam = {}) {
  let veri = await api('/platform/izinler');
  const liste = h('div', { class: 'izin-bolumleri' });
  const gecmis = h('div', {});
  const ozet = h('p', { class: 'kucuk izin-ozeti', 'aria-live': 'polite' });
  const ciz = () => {
    ozet.textContent = `${Object.values(veri.izinler).filter(Boolean).length} / ${IZIN_TANIMLARI.length} izin açık.`;
    const bolunenler = new Set(IZIN_BOLUMLERI.flatMap((b) => b.izinler));
    const bolumler = [...IZIN_BOLUMLERI, { ad: 'baska', baslik: 'Diğer izinler', aciklama: '', izinler: IZIN_TANIMLARI.map((t) => t.anahtar).filter((a) => !bolunenler.has(a)) }];
    liste.replaceChildren(...bolumler.map((b) => {
      const tanimlar = b.izinler.map((a) => IZIN_TANIMLARI.find((t) => t.anahtar === a)).filter((t) => t !== undefined);
      if (!tanimlar.length) return null;
      return h('section', { class: `izin-bolumu${'canli' in b && b.canli ? ' canli' : ''}`, 'aria-label': b.baslik },
        h('h4', {}, 'canli' in b && b.canli ? ikon('uyari') : null, b.baslik),
        b.aciklama ? h('p', { class: `kucuk ${'canli' in b && b.canli ? 'izin-risk' : 'soluk'}` }, b.aciklama) : null,
        h('ul', { class: 'izin-listesi', 'aria-label': b.baslik }, tanimlar.map((t) => izinSatiri(t, veri.izinler[t.anahtar] === true, degistir))));
    }).filter(Boolean));
    gecmis.replaceChildren(degisiklikListesi(veri.degisiklikler || [], veri.makineler || {}));
  };
  /** @param {string} anahtar @param {boolean} acik */
  const degistir = async (anahtar, acik) => {
    const t = IZIN_TANIMLARI.find((x) => x.anahtar === anahtar);
    if (!t) return false;
    if (acik && !(await acmaOnayi(t))) return false;
    try {
      const r = await api('/platform/izin/degistir', { govde: { anahtar, acik, ...(acik ? { onay: true } : {}) } });
      veri = { ...veri, izinler: r.izinler, degisiklikler: r.degisiklikler };
      paket.izinleriGuncelle(r.izinler);
      bildir(`"${t.etiket}" izni ${acik ? 'açıldı' : 'kapatıldı'}.`);
      ciz();
      const yeni = liste.querySelector(`[data-izin="${anahtar}"] .izin-anahtari`);
      if (yeni instanceof HTMLElement) yeni.focus();
      return true;
    } catch (hata) {
      bildir(hata.message, 'hata');
      return false;
    }
  };
  ciz();
  // Paket seçimi: seçilen paketin kapalı izinlerini tek onayla açar (açıkları kapatmaz); liste ve geçmiş hemen güncellenir.
  const paket = izinPaketiSecimi({
    izinler: veri.izinler, bosDugmeMetni: null,
    bitti: (r) => { veri = { ...veri, izinler: r.izinler, degisiklikler: r.degisiklikler || veri.degisiklikler }; ciz(); }
  });
  govde.replaceChildren(
    paket,
    h('div', { class: 'kart' },
      h('h3', {}, ikon('kalkan'), 'İzinler'),
      h('p', { class: 'soluk kucuk' }, 'Nöbetçi\'nin sizin adınıza yaptığı her işlem bir izne bağlıdır. İzinler varsayılan olarak kapalıdır (yukarıdaki paketle birkaçını tek onayla açabilirsiniz); kapalı bir izne bağlı işlem denenirse yapılmaz ve buraya yönlendiren bir uyarı çıkar. Her iznin yanındaki "?" ne yaptığını, nerede kullanıldığını ve riskini anlatır.'),
      ozet,
      liste),
    h('div', { class: 'kart' }, h('h3', {}, ikon('tarih'), 'Son değişiklikler'), gecmis));
  const odak = baglam.odak ? liste.querySelector(`[data-izin="${CSS.escape(baglam.odak)}"]`) : null;
  if (odak instanceof HTMLElement) {
    odak.classList.add('vurgulu');
    odak.scrollIntoView({ block: 'center' });
    const a = odak.querySelector('.izin-anahtari');
    if (a instanceof HTMLElement) a.focus();
  }
}
