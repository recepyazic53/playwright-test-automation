// Ayarlar > Proje ve ortamlar > "Servis taban adresleri". İki görünüm (seçim tarayıcıda hatırlanır; yalnız görünüm):
//  - Taban adresleri (varsayılan, ana iş akışı): adlandırılmış taban adresleri (her biri ortam başına adres) ve "Kullanan: N
//    servis" (açılınca liste). Ekle / Düzenle / Sil pencereleri:
//      · Düzenle: kaydetmeden önce etki penceresi — etkilenen servisler (eski → yeni adres, senaryo / akış sayısı) ve adresi
//        BOŞ kalacak servisler; YALNIZ "Onayla ve kaydet" ile yazılır. Bir ortamın adresini silmek (boş bırakmak) bağlı
//        servislerin o ortamdaki adresini boş bırakır (servis o ortamda koşamaz: "taban adresi tanımlı değil").
//      · Sil: bağlı servislerin adresi boş kalacak — listeyle onay.
//      · Yeni: ad + ortam adresleri, sonra "Hangi servisler bu adresi kullansın?" (önce taban adresi boş olan servisler, sonra
//        diğerleri şu anki adresleriyle; hiçbiri işaretli gelmez) → etki → onay.
//    Adlandırılmamış (servise özel) adres kullanan servisler ayrıca listelenir (servis bazında düzenlenir).
//  - Servis bazında: satır = servis, sütun = ortam (toplu düzenleme, bul-değiştir; etki önizlemesi + onay).
// Adres hücreleri tek satırdır (kök öne çıkar, sorgu dizisi soluk, taşan "…"; tam adres ipucunda + Kopyala); dar ekranda kart.
// Sorgu dizili / parçalı adres kaydında uyarı + onay ya da "Sorgu dizisini kaldır" (engellenmez).
// Hiçbir servise istek atılmaz (adres yalnız biçim olarak denetlenir; erişim kontrolü servis sayfasından).
import { adresGecerliMi, alan, api, bildir, h, ikon, iskelet, mesajKutusu, mesgulIken, rozet, yardimIpucu, yeniKimlik, yerlestir } from './ortak.js';
import { ortamRiskRozeti } from './kosu-paneli.js';

const MOD_ETIKETI = { ortam: 'Ortamın adresi', yok: 'Bu ortamda yok', servis: 'Özel adres' };
const GORUNUM_ANAHTARI = 'nobetci-taban-adresleri-gorunum';
const temiz = (a) => String(a || '').trim().replace(/\/+$/, '');
const gorunumOku = () => { try { return localStorage.getItem(GORUNUM_ANAHTARI) === 'servis' ? 'servis' : 'taban'; } catch { return 'taban'; } };
const gorunumYaz = (g) => { try { localStorage.setItem(GORUNUM_ANAHTARI, g); } catch { /* yok sayılır */ } };
const hucreMetni = (x) => (x.kaynak === 'yok' ? 'bu ortamda yok' : x.kaynak === 'ortam' ? `${x.deger} (ortamın adresi)` : x.deger);
const turRozeti = (s) => rozet(s.tur === 'rest' ? 'REST' : 'SOAP', 'vurgu');
const senaryoOzeti = (s) => `${s.senaryoSayisi} senaryo${s.akislar.length ? ` · ${s.akislar.length} akış` : ''}`;

// --- Adres gösterimi ve sorgu dizisi uyarısı ---------------------------------------------------------------------------------
// Taban adresi bir SUNUCU adresidir (şema + ana makine + isteğe bağlı port ve kök yol). Sorgu dizisi (?…) ya da parça (#…) varsa
// uyarılır ve onay istenir (engellenmez; sunucu da aynı uyarıyı önizlemede döner: servisler/taban-adresleri.mjs).
const SORGU_UYARISI = 'Taban adresinde sorgu dizisi var; servisler bunun sonuna yol ekler, genelde yanlıştır.';
/** Adres = kök (şema + sunucu + yol) + ek (sorgu dizisi / parça; yazıldığı gibi). @param {string} a */
const adresParcalari = (a) => {
  const i = String(a || '').search(/[?#]/);
  return i < 0 ? { kok: String(a || ''), ek: '' } : { kok: a.slice(0, i), ek: a.slice(i) };
};
const sorguVarMi = (a) => Boolean(a && adresParcalari(a).ek);
const sorgusuz = (a) => temiz(adresParcalari(a).kok);
/** Seçim listesi gibi düz metin yerlerde kısa adres: kök (en çok n karakter) + ek varsa "…". */
const kisaAdres = (a, n = 48) => {
  const { kok, ek } = adresParcalari(a);
  return kok.length > n ? `${kok.slice(0, n - 1)}…` : ek ? `${kok}…` : kok;
};

/** Kopyala ikon düğmesi: panoya yazar; pano yoksa (izin / tarayıcı) adres metnini seçer ve bildirir. */
function kopyalaIkonu(metin, etiket, hedef) {
  const d = h('button', { type: 'button', class: 'ikon-dugme hayalet taban-kopyala', title: 'Tam adresi kopyala', 'aria-label': `${etiket}: tam adresi kopyala` }, ikon('kopya'));
  d.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard) throw new Error('pano yok');
      await navigator.clipboard.writeText(metin);
      d.replaceChildren(ikon('onay'));
      setTimeout(() => d.replaceChildren(ikon('kopya')), 1500);
      bildir('Adres panoya kopyalandı.');
    } catch {
      const secim = window.getSelection();
      secim?.removeAllRanges();
      secim?.selectAllChildren(hedef);
      bildir('Panoya kopyalanamadı; adres seçildi, Ctrl+C ile kopyalayın.', 'hata');
    }
  });
  return d;
}

/**
 * Tek satır adres: kök öne çıkar, sorgu dizisi soluk; taşan kısım "…" (CSS). Tam adres ipucunda (title) ve Kopyala düğmesiyle.
 * @param {string} a @param {string} etiket kopyala düğmesinin erişilebilir adı için (ör. "Çekirdek · TEST")
 */
function adresGosterimi(a, etiket) {
  const { kok, ek } = adresParcalari(a);
  const metin = h('code', { class: 'duz taban-adres-metni', title: ek ? `${a}\n${SORGU_UYARISI}` : a },
    h('span', { class: 'taban-adres-kok' }, kok), ek ? h('span', { class: 'taban-adres-sorgu' }, ek) : null);
  return h('span', { class: `taban-adres${ek ? ' sorgulu' : ''}` }, metin, kopyalaIkonu(a, etiket, metin));
}

/** Ortam türü rozeti (Test / Canlı; türü seçilmemişse "Türünü seçin"). */
const ortamTuru = (o) => ortamRiskRozeti(o) || rozet('Test', '', { title: 'Test ortamı' });
/** Ortam sütun başlığı: ad (taşarsa "…") + tür rozeti. */
const ortamBasligi = (o) => h('th', { scope: 'col', class: 'taban-ortam-sutunu', title: o.ad },
  h('span', { class: 'taban-ortam-basligi' }, h('span', { class: 'taban-ortam-adi' }, o.ad), ortamTuru(o)));

/** @param {{ id: string; ad: string }} proje @returns {HTMLElement} */
export function tabanAdresleriBolumu(proje) {
  const kap = h('section', { class: 'kart taban-adresleri', 'aria-labelledby': 'taban-adresleri-basligi' }, iskelet('liste'));
  yukle(kap, proje).catch((e) => { if (!e || e.durum !== 423) yerlestir(kap, h('div', { class: 'not-kutusu hata', role: 'alert' }, e.message || String(e))); });
  return kap;
}

async function yukle(kap, proje) {
  const veri = await api(`/platform/servis-tabanlari?projeId=${encodeURIComponent(proje.id)}`);
  const yenile = () => yukle(kap, proje);
  let gorunum = gorunumOku();
  // Açıklamalar "?" düğmesinin arkasında (sürekli yer kaplamaz): taban adresi tanımı, örnek ve iki görünümün farkı.
  const yardim = yardimIpucu([
    h('p', {}, 'Taban adresi, aynı sunucudaki servislerin her ortamdaki ortak adres başıdır; servisler adresin geri kalanını (yolu) kendileri ekler.'),
    h('p', {}, 'Örnek: ', h('code', { class: 'duz' }, 'TEST: https://test.ornek.local'), ', ', h('code', { class: 'duz' }, 'CANLI: https://ornek.local'),
      ' — servis ', h('code', { class: 'duz' }, '/siparis/Servis.asmx'), ' yolunu ekler. Taban adresi değişince ona bağlı servislerin hepsi birlikte değişir; kaydetmeden önce etkisi gösterilir.'),
    h('p', {}, h('b', {}, 'Taban adresleri: '), 'her taban adresi ve onu kullanan servisler; adresi buradan değiştirince bağlı servislerin hepsi değişir.'),
    h('p', {}, h('b', {}, 'Servis bazında: '), 'her servisin her ortamdaki adresi tek tabloda (servis başına toplu düzenleme, bul-değiştir).')
  ], 'Servis taban adresleri');
  const baslik = h('div', { class: 'bolum-basligi' }, h('h3', { id: 'taban-adresleri-basligi' }, ikon('ag'), 'Servis taban adresleri', rozet(String(veri.tabanAdlari.length)), yardim.dugme));
  const gorunumSecimi = h('div', { class: 'segment taban-gorunum', role: 'radiogroup', 'aria-label': 'Taban adres görünümü' });
  const icerik = h('div');
  // Görünüm anahtarı: yalnız listenin nasıl gösterildiğini değiştirir (veri aynı); seçilenin ne gösterdiği altında yazar.
  const GORUNUMLER = [
    ['taban', 'Taban adresleri', 'Her taban adresi ve onu kullanan servisler; adresi buradan değiştirince bağlı servislerin hepsi değişir.'],
    ['servis', 'Servis bazında', 'Her servisin her ortamdaki adresi tek tabloda (servis başına toplu düzenleme, bul-değiştir).']
  ];
  const ciz = () => {
    yerlestir(gorunumSecimi, GORUNUMLER.map(([d, m, ipucu]) => h('button', {
      type: 'button', role: 'radio', title: ipucu, 'aria-checked': gorunum === d ? 'true' : 'false', 'aria-pressed': gorunum === d ? 'true' : 'false',
      onclick: () => { if (gorunum !== d) { gorunum = d; gorunumYaz(d); ciz(); } }
    }, m)));
    yerlestir(icerik, gorunum === 'servis' ? servisGorunumu(proje, veri, yenile) : tabanGorunumu(proje, veri, yenile));
  };
  yerlestir(kap, baslik, yardim.panel,
    h('div', { class: 'satir-duzen taban-gorunum-satiri' }, h('span', { class: 'soluk kucuk' }, 'Listele:'), gorunumSecimi),
    icerik);
  ciz();
}

// --- Pencere ve etki -------------------------------------------------------------------------------------------------------

/** Başlıklı modal pencere: govde + alt düğmeler (kapanınca DOM'dan kalkar). */
function pencere(baslik, secenekler = {}) {
  const baslikId = yeniKimlik('taban-pencere');
  const kapat = h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': 'Kapat' }, ikon('carpi'));
  const govde = h('div', { class: 'taban-pencere-icerik' });
  const alt = h('div', { class: 'diyalog-alt' });
  const d = h('dialog', { class: `onay-diyalogu taban-diyalogu${secenekler.tehlikeli ? ' tehlikeli' : ''}`, 'aria-labelledby': baslikId },
    h('div', { class: 'diyalog-govde' },
      h('div', { class: 'diyalog-baslik-satiri' },
        h('h2', { id: baslikId }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon(secenekler.ikonAd || 'ag')), baslik), kapat),
      govde),
    alt);
  kapat.addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return { d, govde, alt, kapat: () => d.close() };
}

/**
 * Taban adresine bağlı servisin adresi başka yoldan (içe aktarma, sihirbaz, servis sayfası, "Servis bazında") tabanınkinden farklı bir
 * değere değişecekken kayıttan ÖNCE açılan karar penceresi (ortak.js > api, sunucunun 409 "TABAN_KARARI" yanıtında çağırır).
 * Seçenekler: "Servisi tabandan ayır" / "Tabanın adresini güncelle" (bağlı tüm servisler; etki listesiyle) / "Vazgeç" (yeni adres
 * kullanılmaz, servis tabandaki adreste kalır). Pencere kapatılırsa (Esc / ×) işlem yapılmaz (null).
 * @param {{ servisId: string; servis: string; taban: string; cakismalar: Array<{ ortam: string; eski: string; yeni: string }>; etki: any }} k
 * @returns {Promise<'ayir' | 'tabaniGuncelle' | 'vazgec' | null>}
 */
export function tabanKarariSor(k) {
  return new Promise((coz) => {
    let sonuc = null;
    const p = pencere('Taban adresine bağlı servis', { ikonAd: 'ag' });
    const ayir = h('button', { type: 'button' }, 'Servisi tabandan ayır');
    const guncelle = h('button', { type: 'button', class: 'birincil' }, 'Tabanın adresini güncelle');
    const vazgec = h('button', { type: 'button', class: 'hayalet' }, 'Vazgeç');
    const sec = (x) => { sonuc = x; p.kapat(); };
    ayir.addEventListener('click', () => sec('ayir'));
    guncelle.addEventListener('click', () => sec('tabaniGuncelle'));
    vazgec.addEventListener('click', () => sec('vazgec'));
    const etki = k.etki && k.etki.toplam ? k.etki : null;
    yerlestir(p.govde,
      h('p', { class: 'taban-karari-metni' }, `"${k.servis}" "${k.taban}" taban adresine bağlı; yeni adres farklı:`),
      h('ul', { class: 'taban-karari-farklari', 'aria-label': 'Farklı adresler' }, k.cakismalar.map((c) => h('li', {}, h('b', {}, `${c.ortam}: `),
        c.eski ? h('code', { class: 'duz' }, c.eski) : h('span', { class: 'soluk' }, 'adres yok'), ' → ', h('code', { class: 'duz' }, c.yeni)))),
      h('dl', { class: 'taban-karari-secenekleri' },
        h('dt', {}, 'Servisi tabandan ayır'), h('dd', { class: 'soluk kucuk' }, `Yalnız "${k.servis}" yeni adresi kullanır; "${k.taban}" bağı kalkar. Diğer servisler değişmez.`),
        h('dt', {}, 'Tabanın adresini güncelle'), h('dd', { class: 'soluk kucuk' }, `"${k.taban}" taban adresi değişir; ona bağlı TÜM servisler yeni adresi kullanır.`),
        h('dt', {}, 'Vazgeç'), h('dd', { class: 'soluk kucuk' }, 'Yeni adres kullanılmaz; servis tabandaki adreste kalır. Diğer değişiklikler (ör. içe aktarılan istekler) yine kaydedilir.')),
      etki ? h('details', { class: 'taban-karari-etki' }, h('summary', {}, `"Tabanın adresini güncelle" etkisi (${etki.toplam.servis} servis)`), ...etkiGovdesi(etki)) : null);
    yerlestir(p.alt, vazgec, ayir, guncelle);
    p.d.addEventListener('close', () => coz(sonuc));
    guncelle.focus();
  });
}

/** Etki: etkilenen servisler (eski → yeni, senaryo / akış) ve adresi boş kalacak servisler. */
function etkiGovdesi(e) {
  const bos = e.bosKalacaklar || [];
  const uyarilar = e.uyarilar || [];
  return [
    uyarilar.length ? h('div', { class: 'not-kutusu uyari taban-sorgu-uyarisi' },
      h('b', {}, SORGU_UYARISI), ' Onaylarsanız yine de kaydedilir:',
      h('ul', { 'aria-label': 'Sorgu dizili adresler' }, uyarilar.map((u) => h('li', {}, h('b', {}, `${u.ortam}: `), h('code', { class: 'duz' }, u.adres))))) : null,
    e.toplam.servis
      ? h('div', { class: 'not-kutusu uyari', role: 'alert' },
        `Bu değişiklik şu ${e.toplam.servis} servisi etkiler (${e.toplam.senaryo} senaryo${e.toplam.akis ? `, ${e.toplam.akis} akış` : ''}): sonraki koşular yeni adreslere gider. Onaylamadan hiçbir şey kaydedilmez.`)
      : h('div', { class: 'not-kutusu bilgi' }, 'Hiçbir servis etkilenmez; yalnız taban adresi kaydedilir.'),
    e.toplam.servis ? h('ul', { class: 'taban-etki-listesi', 'aria-label': 'Etkilenen servisler' }, e.servisler.map((s) => h('li', {},
      h('div', {}, h('b', {}, s.ad), ' ', h('span', { class: 'soluk kucuk' }, `${s.senaryoSayisi} senaryo${s.akislar.length ? ` · akışlar: ${s.akislar.join(', ')}` : ''}`)),
      s.grup.eski !== s.grup.yeni ? h('div', { class: 'kucuk' }, `Taban adresi: ${s.grup.eski || 'yok (özel adres)'} → ${s.grup.yeni || 'yok'}`) : null,
      h('ul', {}, s.adresler.map((a) => h('li', { class: 'kucuk' }, h('b', {}, `${a.ortam}: `),
        h('code', { class: 'duz' }, hucreMetni(a.eski)), ' → ', h('code', { class: 'duz' }, hucreMetni(a.yeni)))))))) : null,
    bos.length ? h('div', { class: 'not-kutusu hata taban-bos-uyarisi', role: 'alert' },
      h('b', {}, `Şu ${bos.length} servisin taban adresi BOŞ kalacak`), ' (servis o ortamda koşamaz; koşuda "taban adresi tanımlı değil" hatası verir):',
      h('ul', { 'aria-label': 'Adresi boş kalacak servisler' }, bos.map((x) => h('li', {}, h('b', {}, x.ad), ` — ${x.ortamlar.join(', ')}`)))) : null
  ];
}

// --- Taban adresleri (ana liste) ---------------------------------------------------------------------------------------------

function tabanGorunumu(proje, veri, yenile) {
  const { ortamlar, satirlar, tabanAdlari } = veri;
  const servis = new Map(satirlar.map((s) => [s.servisId, s]));
  const acik = new Set();
  const tabloKap = h('div', { class: 'tablo-kaydirma taban-adlari-kap' });
  const adres = (a, etiket) => (a ? adresGosterimi(a, etiket) : h('span', { class: 'soluk kucuk' }, 'bu ortamda yok'));
  const islem = (girdi) => api('/platform/servis-tabanlari/taban', { govde: { projeId: proje.id, ...girdi } });

  /** Etkiyi pencerede gösterir; "Onayla ve kaydet" yazar. geri: önceki adım. */
  const etkiAdimi = async (p, girdi, geri, dugmeMetni = 'Onayla ve kaydet') => {
    const { onizleme: e } = await islem(girdi);
    const mesaj = mesajKutusu();
    const onayla = h('button', { type: 'button', class: girdi.islem === 'sil' ? 'tehlike' : 'birincil' }, ikon(girdi.islem === 'sil' ? 'cop' : 'onay'), dugmeMetni);
    const vazgec = h('button', { type: 'button' }, 'Vazgeç');
    vazgec.addEventListener('click', p.kapat);
    onayla.addEventListener('click', async () => {
      mesaj.temizle();
      try {
        await mesgulIken(onayla, 'Kaydediliyor…', () => islem({ ...girdi, onay: true }));
        bildir(girdi.islem === 'sil' ? `"${girdi.ad}" taban adresi silindi.` : `"${girdi.yeniAd || girdi.ad}" taban adresi kaydedildi${e.toplam.servis ? ` (${e.toplam.servis} servis güncellendi)` : ''}.`);
        p.kapat();
        await yenile();
      } catch (h2) { mesaj.goster(h2.message); }
    });
    const geriDugme = geri ? h('button', { type: 'button' }, 'Geri') : null;
    geriDugme?.addEventListener('click', geri);
    yerlestir(p.govde, mesaj.kutu, h('div', { role: 'region', 'aria-label': 'Değişikliğin etkisi' }, etkiGovdesi(e)));
    yerlestir(p.alt, geriDugme, vazgec, onayla);
    onayla.focus();
  };

  /** Ekle (t yok) / düzenle: ad + ortam başına adres. */
  const tabanFormu = (t) => {
    const p = pencere(t ? `"${t.ad}" taban adresini düzenle` : 'Yeni taban adresi');
    const mesaj = mesajKutusu();
    const adGirdisi = h('input', { type: 'text', autocomplete: 'off', maxlength: '60', value: t ? t.ad : '', placeholder: 'ör. Çekirdek servisler' });
    const girdiler = ortamlar.map((o) => ({ o, el: h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', value: t ? t.adresler[o.id] || '' : '', placeholder: 'https://… (boş: bu ortamda yok)' }) }));
    const vazgec = h('button', { type: 'button' }, 'Vazgeç');
    vazgec.addEventListener('click', p.kapat);
    const ileri = h('button', { type: 'button', class: 'birincil' }, t ? 'Etkiyi göster' : 'İleri: servisleri seç');
    // Sorgu dizisi / parça uyarısı (engellemez): "Sorgu dizisini kaldır" ya da "Yine de kaydet" (onay bu adreslere özgüdür).
    const uyariKap = h('div');
    let onayliAdresler = '';
    const sorguUyarisi = (liste, imza) => {
      const kaldir = h('button', { type: 'button', class: 'birincil' }, 'Sorgu dizisini kaldır');
      const yineDe = h('button', { type: 'button' }, 'Yine de kaydet');
      kaldir.addEventListener('click', () => {
        for (const g of liste) g.el.value = sorgusuz(g.el.value);
        yerlestir(uyariKap);
        bildir('Sorgu dizisi adresten kaldırıldı (henüz kaydedilmedi).');
        ileri.focus();
      });
      yineDe.addEventListener('click', () => { onayliAdresler = imza; yerlestir(uyariKap); ileri.click(); });
      yerlestir(uyariKap, h('div', { class: 'not-kutusu uyari taban-sorgu-uyarisi', role: 'alert' },
        h('p', {}, h('b', {}, `${SORGU_UYARISI} Yine de kaydet?`)),
        h('ul', { 'aria-label': 'Sorgu dizili adresler' }, liste.map((g) => {
          const { kok, ek } = adresParcalari(temiz(g.el.value));
          return h('li', {}, h('b', {}, `${g.o.ad}: `), h('code', { class: 'duz' }, kok, h('span', { class: 'taban-adres-sorgu' }, ek)));
        })),
        h('p', { class: 'soluk kucuk' }, 'Taban adresi yalnız sunucu adresidir (ör. https://ornek.local/api); sorgu parametreleri servisin isteğinde tanımlanır.'),
        h('div', { class: 'dugmeler' }, kaldir, yineDe)));
      kaldir.focus();
    };
    const goster = () => {
      yerlestir(uyariKap);
      yerlestir(p.govde, mesaj.kutu, uyariKap, alan('Taban adresinin adı', adGirdisi),
        ...girdiler.map((g) => alan(`${g.o.ad} adresi`, g.el)),
        h('p', { class: 'soluk kucuk' }, t
          ? 'Adresi boş bırakılan ortamda bu taban adresine bağlı servisler koşamaz (adres boş kalır). Kaydetmeden önce etkisi gösterilir.'
          : 'Boş bırakılan ortamda bu taban adresi yoktur. Sonraki adımda bu adresi kullanacak servisleri seçersiniz.'));
      yerlestir(p.alt, vazgec, ileri);
    };
    ileri.addEventListener('click', async () => {
      mesaj.temizle();
      const ad = adGirdisi.value.trim();
      if (!ad) { mesaj.goster('Taban adresine bir ad verin.'); return; }
      const adresler = Object.fromEntries(girdiler.map((g) => [g.o.id, temiz(g.el.value)]));
      const hatali = girdiler.find((g) => adresler[g.o.id] && !adresGecerliMi(adresler[g.o.id]));
      if (hatali) { mesaj.goster(`${hatali.o.ad}: "${adresler[hatali.o.id]}" geçerli bir http(s) adresi değil.`); return; }
      if (!Object.values(adresler).some(Boolean) && !t) { mesaj.goster('En az bir ortam için adres yazın.'); return; }
      // Yalnız yeni / değişen adres uyarılır (kayıtlı adresler olduğu gibi kalır).
      const sorgulu = girdiler.filter((g) => sorguVarMi(adresler[g.o.id]) && adresler[g.o.id] !== (t ? t.adresler[g.o.id] || '' : ''));
      const imza = JSON.stringify(adresler);
      if (sorgulu.length && onayliAdresler !== imza) { sorguUyarisi(sorgulu, imza); return; }
      yerlestir(uyariKap);
      try {
        if (t) await mesgulIken(ileri, 'Hesaplanıyor…', () => etkiAdimi(p, { islem: 'degistir', ad: t.ad, ...(ad !== t.ad ? { yeniAd: ad } : {}), adresler }, goster));
        else servisSecimi(p, ad, adresler, goster);
      } catch (h2) { mesaj.goster(h2.message); }
    });
    goster();
    adGirdisi.focus();
  };

  /** Yeni taban: "Hangi servisler bu adresi kullansın?" — önce taban adresi boş olanlar; hiçbiri işaretli gelmez. */
  const servisSecimi = (p, ad, adresler, geri) => {
    const mesaj = mesajKutusu();
    const bosOrtamlar = (s) => ortamlar.filter((o) => s.tabanlar[o.id].kaynak === 'yok');
    const sirala = (a, b) => a.ad.localeCompare(b.ad, 'tr');
    const boslar = satirlar.filter((s) => bosOrtamlar(s).length).sort(sirala);
    const digerleri = satirlar.filter((s) => !bosOrtamlar(s).length).sort(sirala);
    const secili = new Set();
    const oge = (s) => {
      const c = h('input', { type: 'checkbox', 'aria-label': s.ad });
      c.addEventListener('change', () => { if (c.checked) secili.add(s.servisId); else secili.delete(s.servisId); });
      return h('li', {}, h('label', { class: 'secenek' }, c, h('span', {}, h('b', {}, s.ad), ' ', turRozeti(s))),
        h('div', { class: 'soluk kucuk taban-servis-adresleri' },
          ortamlar.map((o) => h('span', {}, `${o.ad}: `, s.tabanlar[o.id].kaynak === 'yok' ? h('b', { class: 'taban-yok-notu' }, 'boş') : h('code', { class: 'duz' }, hucreMetni(s.tabanlar[o.id])))),
          s.grup ? h('span', {}, `şu an: ${s.grup}`) : null));
    };
    const grup = (etiket, liste, aciklama) => (liste.length ? h('fieldset', { class: 'taban-secim-grubu' }, h('legend', {}, etiket, ' ', rozet(String(liste.length))),
      aciklama ? h('p', { class: 'soluk kucuk' }, aciklama) : null, h('ul', { class: 'taban-secim-listesi', 'aria-label': etiket }, liste.map(oge))) : null);
    const vazgec = h('button', { type: 'button' }, 'Vazgeç');
    vazgec.addEventListener('click', p.kapat);
    const geriDugme = h('button', { type: 'button' }, 'Geri');
    geriDugme.addEventListener('click', geri);
    const ileri = h('button', { type: 'button', class: 'birincil' }, ikon('liste'), 'Etkiyi göster');
    const goster = () => {
      secili.clear();
      yerlestir(p.govde, mesaj.kutu,
        h('p', {}, h('b', {}, 'Hangi servisler bu adresi kullansın?'), ' ', h('span', { class: 'soluk kucuk' }, 'İşaretlenen servisler bu taban adresine bağlanır. Başka adresi olan servisin adresi değişir; kaydetmeden önce etkisi gösterilir.')),
        satirlar.length ? null : h('p', { class: 'soluk kucuk' }, 'Henüz servis yok: taban adresi servissiz kaydedilir.'),
        grup('Taban adresi boş olan servisler', boslar, 'En az bir ortamda adresi yok (o ortamda koşamaz).'),
        grup('Diğer servisler (şu anki adresleriyle)', digerleri, null));
      yerlestir(p.alt, geriDugme, vazgec, ileri);
    };
    ileri.addEventListener('click', async () => {
      mesaj.temizle();
      try {
        await mesgulIken(ileri, 'Hesaplanıyor…', () => etkiAdimi(p, { islem: 'ekle', ad, adresler, baglanacaklar: [...secili] }, goster));
      } catch (h2) { mesaj.goster(h2.message); }
    });
    goster();
  };

  const sil = async (t) => {
    const p = pencere(`"${t.ad}" taban adresi silinsin mi?`, { tehlikeli: true, ikonAd: 'cop' });
    try {
      await etkiAdimi(p, { islem: 'sil', ad: t.ad }, null, 'Onayla ve sil');
    } catch (h2) { p.kapat(); bildir(h2.message, 'hata'); }
  };

  const ciz = () => {
    const uyeSatiri = (t) => h('tr', { class: 'taban-grup-uyeleri', id: `taban-uyeler-${t.ad.replace(/[^a-zA-Z0-9_-]/g, '_')}` }, h('td', { colspan: String(ortamlar.length + 3) },
      t.kullanan.length ? h('ul', { class: 'taban-uye-listesi', 'aria-label': `${t.ad}: servisler` }, t.kullanan.map((id) => {
        const s = servis.get(id);
        const yoklar = ortamlar.filter((o) => s.tabanlar[o.id].kaynak === 'yok' && t.adresler[o.id]);
        return h('li', {}, h('span', { class: 'taban-uye-adi' }, h('b', {}, s.ad), ' ', turRozeti(s)),
          h('span', { class: 'soluk kucuk' }, h('code', { class: 'duz' }, s.yol || '—'), ` · ${senaryoOzeti(s)}`),
          yoklar.length ? h('span', { class: 'kucuk taban-yok-notu' }, `${yoklar.map((o) => o.ad).join(', ')} ortamında yok`) : null);
      })) : h('p', { class: 'soluk kucuk' }, 'Bu taban adresini kullanan servis yok.')));
    // Sabit düzen (colgroup): Ad ve ortam sütunları dengeli, Kullanan / İşlem dar; adres hücreleri tek satır ("…" + ipucu + Kopyala).
    // Dar ekranda (stil.css) satırlar kart olur: her hücrenin üstünde ortam etiketi (taban-hucre-etiketi) görünür.
    const tablo = h('table', { class: 'ozet-tablosu taban-tablosu taban-adlari-tablosu', role: 'table', 'aria-label': 'Taban adresleri', 'data-siralama': 'yok' },
      h('colgroup', {}, h('col', { class: 'taban-sutun-ad' }), ortamlar.map(() => h('col', { class: 'taban-sutun-ortam' })),
        h('col', { class: 'taban-sutun-kullanan' }), h('col', { class: 'taban-sutun-islem' })),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Ad'), ortamlar.map(ortamBasligi), h('th', { scope: 'col' }, 'Kullanan'), h('th', { scope: 'col' }, 'İşlem'))),
      h('tbody', {}, tabanAdlari.flatMap((t) => {
        const acikMi = acik.has(t.ad);
        const kullanan = h('button', { type: 'button', class: 'taban-kullanan', 'aria-expanded': acikMi ? 'true' : 'false', 'aria-label': `${t.ad} — Kullanan: ${t.kullanan.length} servis`, title: 'Bu taban adresini kullanan servisler' },
          `${t.kullanan.length} servis `, h('span', { 'aria-hidden': 'true' }, acikMi ? '▾' : '▸'));
        kullanan.addEventListener('click', () => { if (acikMi) acik.delete(t.ad); else acik.add(t.ad); ciz(); });
        const duzenle = h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${t.ad}: düzenle` }, ikon('duzenle'), 'Düzenle');
        duzenle.addEventListener('click', () => tabanFormu(t));
        const silDugmesi = h('button', { type: 'button', class: 'kucuk-dugme tehlike', 'aria-label': `${t.ad}: sil` }, ikon('cop'), 'Sil');
        silDugmesi.addEventListener('click', () => sil(t));
        const satir = h('tr', { class: 'taban-satiri-ana' },
          h('th', { scope: 'row', class: 'taban-ad-hucresi', title: t.ad }, h('b', {}, t.ad)),
          ortamlar.map((o) => h('td', { class: 'taban-adres-hucresi' },
            h('span', { class: 'taban-hucre-etiketi', 'aria-hidden': 'true' }, h('span', { class: 'taban-ortam-adi' }, o.ad), ortamTuru(o)),
            adres(t.adresler[o.id], `${t.ad} · ${o.ad}`))),
          h('td', { class: 'taban-kullanan-hucresi' }, kullanan),
          h('td', { class: 'taban-islem-hucresi' }, h('div', { class: 'dugmeler taban-satir-dugmeleri' }, duzenle, silDugmesi)));
        return acikMi ? [satir, uyeSatiri(t)] : [satir];
      })));
    yerlestir(tabloKap, tabanAdlari.length ? tablo : h('p', { class: 'soluk kucuk' }, 'Henüz taban adresi yok. "Taban adresi ekle" ile ekleyip servisleri ona bağlayın.'));
  };

  const adsizlar = satirlar.filter((s) => !s.grup).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const yeni = h('button', { type: 'button', class: 'birincil' }, ikon('arti'), 'Taban adresi ekle');
  yeni.addEventListener('click', () => tabanFormu(null));
  ciz();
  return h('div', {},
    h('div', { class: 'dugmeler' }, yeni),
    tabloKap,
    adsizlar.length ? h('details', { class: 'taban-adsizlar' },
      h('summary', {}, `Adlandırılmamış adres kullanan ${adsizlar.length} servis`),
      h('p', { class: 'soluk kucuk' }, 'Bu servisler kendi (servise özel) adreslerini ya da ortamın adresini kullanır. Bir taban adresine bağlamak için yeni taban adresi ekleyip seçin ya da "Servis bazında" görünümde düzenleyin.'),
      h('ul', { class: 'taban-uye-listesi', 'aria-label': 'Adlandırılmamış adres kullanan servisler' }, adsizlar.map((s) => h('li', {},
        h('span', { class: 'taban-uye-adi' }, h('b', {}, s.ad), ' ', turRozeti(s)),
        h('span', { class: 'soluk kucuk taban-servis-adresleri' }, ortamlar.map((o) => {
          const x = s.tabanlar[o.id];
          return h('span', { class: 'taban-servis-adresi' }, `${o.ad}: `, x.kaynak === 'yok' || !x.deger ? 'bu ortamda yok'
            : [adresGosterimi(x.deger, `${s.ad} · ${o.ad}`), x.kaynak === 'ortam' ? ' (ortamın adresi)' : null]);
        })))))) : null);
}

// --- Servis bazında (toplu düzenleme) ------------------------------------------------------------------------------------

function servisGorunumu(proje, veri, yenile) {
  const { ortamlar, satirlar } = veri;
  if (!satirlar.length) return h('p', { class: 'soluk kucuk' }, 'Henüz servis yok. Servis eklenince taban adresleri burada toplu düzenlenir.');
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
  const gruplar = () => [...new Set([...veri.tabanAdlari.map((t) => t.ad), ...[...taslak.values()].map((t) => t.grup).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'tr'));
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
  /** Ada bağlama: adın başka üyesi (ya da kayıtlı adresi) varsa adresleri bu servise kopyalanır. */
  const grupAta = (servisId, ad) => {
    const t = taslak.get(servisId);
    t.grup = ad.trim();
    const uye = t.grup ? [...taslak.entries()].find(([id, x]) => id !== servisId && x.grup === t.grup) : null;
    if (uye) { for (const o of ortamlar) if (t.hucreler[o.id].mod !== 'eski') t.hucreler[o.id] = { ...uye[1].hucreler[o.id] }; return; }
    const kayitli = t.grup ? veri.tabanAdlari.find((x) => x.ad === t.grup) : null;
    if (kayitli) for (const o of ortamlar) t.hucreler[o.id] = kayitli.adresler[o.id] ? { mod: 'servis', deger: kayitli.adresler[o.id] } : { mod: 'yok', deger: '' };
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
  const hucreDegisti = (id, ortamId) => { const a = ozgun.get(id).hucreler[ortamId]; const b = taslak.get(id).hucreler[ortamId]; return a.mod !== b.mod || temiz(a.deger) !== temiz(b.deger); };

  const hucreDenetimi = (etiket, o, x, ata) => {
    // Seçim metninde ortamın adresi kısaltılır (tam adres seçimin ipucunda); girdi tek satırdır, tam değer ipucunda.
    const mod = h('select', { 'aria-label': `${etiket}: adres türü`, title: x.mod === 'ortam' ? temiz(o.tabanUrl) : null },
      Object.entries(MOD_ETIKETI).map(([m, e]) => h('option', { value: m, selected: x.mod === m }, m === 'ortam' ? `${e} (${kisaAdres(temiz(o.tabanUrl), 36)})` : e)));
    const girdi = h('input', { type: 'url', autocomplete: 'off', spellcheck: 'false', value: x.deger, placeholder: 'https://', hidden: x.mod !== 'servis', 'aria-label': `${etiket}: taban adres`,
      title: x.deger || null, list: o.tabanAdresleri.length ? `${grupListesi.id}-${o.id}` : null });
    mod.addEventListener('change', () => { ata({ mod: mod.value, deger: mod.value === 'servis' ? (x.deger || temiz(o.tabanUrl)) : '' }); ciz(); });
    girdi.addEventListener('change', () => { ata({ mod: 'servis', deger: girdi.value.trim() }); ciz(); });
    let uyari = null;
    if (x.mod === 'servis' && x.deger && !adresGecerliMi(x.deger)) uyari = h('div', { class: 'alan-hatasi', role: 'alert' }, 'http:// ya da https:// ile başlamalı');
    else if (x.mod === 'servis' && sorguVarMi(x.deger)) {
      const kaldir = h('button', { type: 'button', class: 'kucuk-dugme' }, 'Sorgu dizisini kaldır');
      kaldir.addEventListener('click', () => { ata({ mod: 'servis', deger: sorgusuz(x.deger) }); ciz(); });
      uyari = h('div', { class: 'taban-hucre-uyarisi', role: 'status' }, h('span', {}, SORGU_UYARISI), kaldir);
    }
    return [h('div', { class: 'taban-hucresi' }, mod, girdi), uyari];
  };
  const eskiHucre = (x, etiket) => h('div', { class: 'taban-eski-hucre', title: 'Eski tam adres ayarı (servis sayfasında İşlemler > Taban adresler ile değiştirilir)' },
    adresGosterimi(x.deger, etiket), rozet('tam adres', 'durdu'));
  const hucre = (s, o) => {
    const x = taslak.get(s.servisId).hucreler[o.id];
    if (x.mod === 'eski') return h('td', { class: 'taban-adres-hucresi' }, eskiHucre(x, `${s.ad} · ${o.ad}`));
    return h('td', { class: hucreDegisti(s.servisId, o.id) ? 'degisti' : null }, hucreDenetimi(`${s.ad} · ${o.ad}`, o, x, (y) => hucreAta(s.servisId, o.id, y)));
  };

  const hepsi = h('input', { type: 'checkbox', 'aria-label': 'Tüm servisleri seç' });
  hepsi.addEventListener('change', () => { for (const s of satirlar) if (hepsi.checked) secili.add(s.servisId); else secili.delete(s.servisId); ciz(); });
  const ortamBasliklari = () => ortamlar.map(ortamBasligi);

  const servisTablosu = () => {
    const sirali = [...satirlar].sort((a, b) => (taslak.get(a.servisId).grup || '￿').localeCompare(taslak.get(b.servisId).grup || '￿', 'tr') || a.ad.localeCompare(b.ad, 'tr'));
    return h('table', { class: 'ozet-tablosu taban-tablosu', 'aria-label': 'Servis taban adresleri' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, hepsi), h('th', { scope: 'col' }, 'Servis'), h('th', { scope: 'col' }, 'Taban adres adı'), ortamBasliklari())),
      h('tbody', {}, sirali.map((s) => {
        const t = taslak.get(s.servisId);
        const sec = h('input', { type: 'checkbox', checked: secili.has(s.servisId), 'aria-label': `${s.ad} seç` });
        sec.addEventListener('change', () => { if (sec.checked) secili.add(s.servisId); else secili.delete(s.servisId); hepsi.checked = secili.size === satirlar.length; });
        const grup = h('input', { type: 'text', autocomplete: 'off', value: t.grup, maxlength: '60', placeholder: 'ad yok', list: grupListesi.id, 'aria-label': `${s.ad}: taban adres adı` });
        grup.addEventListener('change', () => { grupAta(s.servisId, grup.value); ciz(); });
        return h('tr', {},
          h('td', {}, sec),
          h('th', { scope: 'row', class: 'taban-servis-hucresi' }, s.ad, ' ', turRozeti(s),
            h('div', { class: 'soluk kucuk taban-servis-yolu', title: s.yol || null }, h('code', { class: 'duz' }, s.yol || '—'), ` · ${senaryoOzeti(s)}`)),
          h('td', { class: (ozgun.get(s.servisId).grup || '') !== (t.grup || '') ? 'degisti' : null }, grup),
          ortamlar.map((o) => hucre(s, o)));
      })));
  };

  const ciz = () => {
    yerlestir(grupListesi, gruplar().map((g) => h('option', { value: g })));
    hepsi.checked = secili.size === satirlar.length;
    yerlestir(tabloKap, servisTablosu(),
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

  // --- Etki önizlemesi ve kayıt ---------------------------------------------------------------------------------------
  const etkiGoster = h('button', { type: 'button', class: 'birincil' }, ikon('liste'), 'Etkiyi göster');
  const geriAl = h('button', { type: 'button' }, 'Değişiklikleri geri al');
  geriAl.addEventListener('click', () => { for (const s of satirlar) taslak.set(s.servisId, JSON.parse(JSON.stringify(ozgun.get(s.servisId)))); ciz(); });
  etkiGoster.addEventListener('click', async () => {
    mesaj.temizle();
    const d = degisiklikler();
    for (const [id, x] of Object.entries(d)) {
      for (const [, a] of Object.entries(x.tabanlar || {})) {
        if (a && !adresGecerliMi(a)) { mesaj.goster(`${satirlar.find((s) => s.servisId === id).ad}: "${a}" geçerli bir http(s) adresi değil.`); return; }
      }
    }
    try {
      const on = await mesgulIken(etkiGoster, 'Hesaplanıyor…', () => api('/platform/servis-tabanlari/uygula', { govde: { projeId: proje.id, degisiklikler: d } }));
      const e = on.onizleme;
      // Bağlı servislerin kararları önizlemede verildi (taban karar penceresi); kayıtta aynen gönderilir.
      const kararlar = on.tabanKararlari ? { tabanKararlari: on.tabanKararlari } : {};
      const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Onayla ve kaydet');
      const vazgec = h('button', { type: 'button' }, 'Vazgeç');
      vazgec.addEventListener('click', () => yerlestir(etkiKap));
      kaydet.addEventListener('click', async () => {
        try {
          await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/servis-tabanlari/uygula', { govde: { projeId: proje.id, degisiklikler: d, onay: true, ...kararlar } }));
          bildir(`${e.toplam.servis} servisin taban adresi güncellendi.`);
          await yenile();
        } catch (h2) { mesaj.goster(h2.message); }
      });
      const bos = e.servisler.map((s) => ({ ad: s.ad, ortamlar: s.adresler.filter((a) => a.yeni.kaynak === 'yok' && a.eski.kaynak !== 'yok').map((a) => a.ortam) })).filter((x) => x.ortamlar.length);
      yerlestir(etkiKap, h('div', { class: 'kart', role: 'region', 'aria-label': 'Değişikliğin etkisi' },
        etkiGovdesi({ ...e, bosKalacaklar: bos }),
        h('p', { class: 'soluk kucuk' }, 'Erişim kontrolü yapılmaz (dış istek atılmaz); SOAP servisinde isterseniz servis sayfasından kontrol edin.'),
        h('div', { class: 'dugmeler' }, kaydet, vazgec)));
      kaydet.focus();
    } catch (h2) { mesaj.goster(h2.message); }
  });

  const kap = h('div', {},
    mesaj.kutu, grupListesi,
    h('details', { class: 'taban-toplu' }, h('summary', {}, 'Toplu düzenle (seçili satırlar; seçim yoksa tümü)'),
      h('fieldset', {}, h('legend', {}, 'Bul ve değiştir'), h('div', { class: 'satir-duzen' }, alan('Ortam', bulOrtam), alan('Bul', bul), alan('Yerine', yeni), degistir)),
      h('fieldset', {}, h('legend', {}, 'Seçilenlere adres ata'), h('div', { class: 'satir-duzen' }, alan('Ortam', atamaOrtami), alan('Adres türü', atamaModu), alan('Adres', atamaAdresi), ata))),
    tabloKap,
    h('div', { class: 'dugmeler' }, etkiGoster, geriAl, durumMetni),
    etkiKap);
  ciz();
  return kap;
}
