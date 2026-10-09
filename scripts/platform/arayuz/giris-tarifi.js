// Ayarlar > Giriş profilleri > "Giriş tarifi" (genel): ortam başına giriş sayfasının tarifi. Form ZORUNLU olanlarla başlar (giriş
// sayfasının adresi, kullanıcı adı / parola alanı, giriş düğmesi, girişin başarılı olduğunu gösteren yazı; "Analiz et" bunları
// kendisi bulur, her alanın altında örnekli tek cümlelik yardım vardır); gerisi (oturum kontrolü, giriş adımları, hata göstergeleri,
// iki aşamalı doğrulama, bağlam değiştirme) kapalı "Gelişmiş ayarlar" altındadır. Adımlar önce OKUNUR özetle gösterilir
// (giris-ozeti.mjs). Adres alanlarına yol ya da TAM adres yazılabilir (taban adres + yol olarak ayrılır; adres-ayirma.mjs).
// Tarifte gizli değer yoktur (parola/anahtar/kod ve ek alan değerleri giriş profilindedir). "Analiz et" YALNIZCA
// kullanıcı açıkça isteyip onaylayınca ortamın giriş sayfasını sunucuda görünmez bir tarayıcıda açar
// (alan doldurmaz, göndermez, düğmeye basmaz). "Girişi kaydet" YALNIZCA kullanıcı onaylayınca görünür tarayıcıda giriş sayfasını açar;
// kullanıcı girişi kendisi yapar, yazılan değerler kaydedilmez. Ardından TEK onay ekranı: adımların rolü önerilmiş gelir,
// yalnız gerekenler sorulur (kod kaynağı; başarı yazısı kayıttan çıkmadıysa), tarif doğrudan kaydedilir (tüm ayrıntılar
// isteğe bağlı olarak formda). Kaydedince, ortamın giriş profili yoksa kayıttan çıkan alanlarla profil oluşturulması önerilir
// (yalnız hangi alanların gerektiği bilinir; DEĞERLER kayıtta okunmaz, kullanıcı bir kez girer, kasada şifreli saklanır).
// Kaydetme sunucuda doğrulanır (scripts/platform/giris/tarif.mjs).
// #/ayarlar/giris/tarif/<ortamId> ilgili ortamın tarif formunu doğrudan açar (giriş yalnız buradan yönetilir; Ekranlar'da listelenmez).
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, oneriListesi, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { canliOnayEki, canliOnayIste, onayIste } from './kosu-paneli.js';
import { girisAdimlariOzeti } from './giris-ozeti.mjs';
import { girisiDeneDugmesi } from './giris-denemesi.js';
import { gezinmeOzetiKutusu } from './gezinme-ozeti.js';
import {
  AYNI_ADRES_UYARISI, basariAdresindenYol, girisSonrasiSayfasiniHatirla, hatirlananGirisSonrasiSayfasi, oturumAdresiGirisleAyniMi, oturumAdresiOnerisi
} from './oturum-kontrolu.mjs';
import { adresiAyir, kokenKayitliMi } from './adres-ayirma.mjs';

const OTURUM_ADRESI_YARDIMI = 'İsteğe bağlı. Girişten sonra açılan bir sayfa (ör. /panel): giriş yapılmış mı diye Nöbetçi her testten önce bu sayfaya bakar '
  + '(yalnız giriş yapan kullanıcıya açık olmalı; giriş sayfası olmaz). Boş bırakırsanız Nöbetçi giriş sonrası açılan sayfayı kendisi bulur.';
/**
 * Oturum kontrol adresinin yardımı + Koşu ayarındaki "Oturum kontrolü (sn)" ile ilişkisi (bağlantı ayarı açıp odaklar;
 * karşı tarafta ayarın altında buraya bağlantı vardır: ayarlar/kosu-ayarlari.mjs > baglanti).
 */
const oturumAdresiYardimi = () => h('span', {}, OTURUM_ADRESI_YARDIMI,
  ' Denetimin en çok ne kadar süreceği Koşu ayarındadır; adres yanlışsa her test bu süre kadar bekler: ',
  h('a', { href: '#/ayarlar/kosu/oturumKontrolSn', class: 'oturum-suresi-baglantisi' }, 'Koşu › Gelişmiş › Oturum kontrolü (sn)'), '.');

const IKINCI_ADIM_ETIKETI = { yok: 'Yok', totp: 'Authenticator (TOTP)', sms: 'SMS' };
const KAYNAK_ROZETI = {
  kayitli: ['Kaydedilmiş', 'basari'],
  yok: ['Tanımlı değil', 'uyari']
};
const SECICI_YARDIMI = 'Playwright seçicisi: CSS (#kimlik, input[name="kullanici"]), text=Giriş ya da role=button[name="Giriş"]. Birden fazla öğe eşleşirse ilki kullanılır.';
const OZEL_ACIKLAMA = {
  kullaniciAdi: 'Giriş profilindeki kullanıcı adı, “Gelişmiş” bölümündeki kullanıcı adı seçicisine yazılır.',
  parola: 'Giriş profilindeki parola (kasada şifreli), “Gelişmiş” bölümündeki parola seçicisine yazılır.',
  gonder: 'Gelişmiş bölümündeki giriş düğmesine basılır; sonra başarı / hata göstergesi (ya da doğrulama kodu) beklenir.'
};
const VARSAYILAN_GIRIS_ADIMLARI = [{ islem: 'kullaniciAdi' }, { islem: 'parola' }, { islem: 'gonder' }];
const HEDEFLI = ['tikla', 'doldur', 'sec', 'gorunurBekle', 'degerBekle', 'sayiBekle', 'metinBekle'];

/** Boş tarif iskeleti (yeni tarif). */
const bosTarif = () => ({
  girisAdresi: '/', oturumKontrolAdresi: '', kullaniciAlani: '', parolaAlani: '', gonderDugmesi: '',
  basariGostergesi: { tur: 'metin', deger: '' }, hataGostergeleri: [], ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 45, baglamDegistirme: null
});

const monoGirdi = (deger, ek = {}) => h('input', { type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', value: deger ?? '', ...ek });

/** Tarifin tek satırlık teknik özeti. */
function ozet(t) {
  if (!t) return 'Bu ortamda giriş yapılamaz; tarif tanımlayın.';
  const parca = [`Giriş: ${t.girisAdresi}`, `2FA: ${IKINCI_ADIM_ETIKETI[t.ikinciAdim.tur] || t.ikinciAdim.tur}`];
  parca.push(t.baglamDegistirme ? `Bağlam: ${t.baglamDegistirme.baglamTuru} (${t.baglamDegistirme.adimlar.length} adım)` : 'Bağlam değiştirme yok');
  if (t.girisSonrasiAkis) parca.push(`Her girişte: ${t.girisSonrasi && t.girisSonrasi.ad ? t.girisSonrasi.ad : t.girisSonrasiAkis.dosya.replace(/\.model\.json$/, '')}`);
  return parca.join(' · ');
}

/** Okunur adım listesi (ol). */
function okunurAdimlar(tarif) {
  const liste = girisAdimlariOzeti(tarif);
  return h('ol', { class: 'giris-ozet-adimlari' }, liste.map((x) => h('li', { class: x.bolum !== 'giris' ? `giris-ozet-${x.bolum}` : null }, x.metin)));
}

/** Adımın düzenleme için kopyası; kaydederken geçici alanlar temizlenir. */
function adimlariTemizle(adimlar) {
  return adimlar.map((a) => {
    const { _yanitYolu, ...kalan } = a;
    if (a.islem === 'tikla') {
      if (_yanitYolu !== undefined) { if (String(_yanitYolu).trim()) kalan.yanitBekle = { yol: String(_yanitYolu).trim() }; else delete kalan.yanitBekle; }
      if (kalan.adresBekle !== undefined && !String(kalan.adresBekle).trim()) delete kalan.adresBekle;
    }
    if (kalan.aciklama !== undefined && !String(kalan.aciklama).trim()) delete kalan.aciklama;
    if (kalan.hedef && 'metin' in kalan.hedef && !String(kalan.hedef.metin).trim()) delete kalan.hedef.metin;
    if (a.islem === 'sayiBekle') kalan.sayi = Number(kalan.sayi);
    if (a.islem === 'bekle') kalan.saniye = Number(kalan.saniye);
    return kalan;
  });
}

const varsayilanMi = (adimlar) => adimlar.length === 3 && adimlar.every((a, i) => Object.keys(a).length === 1 && a.islem === VARSAYILAN_GIRIS_ADIMLARI[i].islem);

/**
 * Sıralı adım düzenleyici (bağlam adımları ve giriş adımları ortak).
 * @param {{ adimlar: any[]; islemler: Array<{ islem: string; etiket: string }>; onEk: string; ogeSinifi: string; degerYardimi: string; degisti?: () => void; taban?: { url: string; ad?: string } }} s
 */
function adimDuzenleyici(s) {
  const { adimlar } = s;
  const liste = h('ol', { class: 'tarif-adimlari' });
  const degisti = () => { if (s.degisti) s.degisti(); };
  const ciz = () => { liste.replaceChildren(...adimlar.map((a, i) => satir(a, i))); degisti(); };
  const satir = (a, i) => {
    const no = `${s.onEk} ${i + 1}`;
    const islem = h('select', { 'aria-label': `${no}: işlem` }, s.islemler.map((x) => h('option', { value: x.islem, selected: a.islem === x.islem }, x.etiket)));
    islem.addEventListener('change', () => {
      const yeni = { islem: islem.value };
      if (a.aciklama) yeni.aciklama = a.aciklama;
      if (islem.value === 'bekle') yeni.saniye = 5;
      if (HEDEFLI.includes(islem.value)) yeni.hedef = a.hedef || { secici: '' };
      adimlar[i] = yeni;
      ciz();
    });
    const govde = h('div', { class: 'tarif-adim-alanlari' });
    const girdi = (etiket, anahtar, yardim, nesne = a) => {
      const g = monoGirdi(nesne[anahtar] ?? '', { 'aria-label': `${no}: ${etiket}` });
      g.addEventListener('input', () => { nesne[anahtar] = g.value; degisti(); });
      return h('label', { class: 'mini-alan' }, h('span', {}, etiket), g, yardim ? h('small', { class: 'soluk' }, yardim) : null);
    };
    const hedefAlanlari = () => {
      a.hedef = a.hedef || { secici: '' };
      const rolMu = 'rol' in a.hedef;
      const tur = h('select', { 'aria-label': `${no}: hedef türü` }, h('option', { value: 'secici', selected: !rolMu }, 'Seçici'), h('option', { value: 'rol', selected: rolMu }, 'Rol + ad'));
      tur.addEventListener('change', () => { a.hedef = tur.value === 'rol' ? { rol: 'button', ad: '' } : { secici: '' }; ciz(); });
      const parcalar = [h('label', { class: 'mini-alan dar' }, h('span', {}, 'Hedef'), tur)];
      if (rolMu) {
        parcalar.push(girdi('Rol', 'rol', 'ör. button, link, textbox', a.hedef), girdi('Erişilebilir ad', 'ad', null, a.hedef));
      } else {
        parcalar.push(girdi('Seçici', 'secici', null, a.hedef), girdi('Metni içeren', 'metin', 'İsteğe bağlı', a.hedef));
        const tam = h('input', { type: 'checkbox', id: yeniKimlik('tam'), checked: Boolean(a.hedef.tamMetin) });
        tam.addEventListener('change', () => { if (tam.checked) a.hedef.tamMetin = true; else delete a.hedef.tamMetin; });
        parcalar.push(h('label', { class: 'secenek mini-secenek', for: tam.id }, tam, 'Metin birebir'));
      }
      return parcalar;
    };
    if (a.islem === 'tikla' && a.yanitBekle && a._yanitYolu === undefined) a._yanitYolu = a.yanitBekle.yol;
    switch (a.islem) {
      case 'kullaniciAdi': case 'parola': case 'gonder':
        govde.append(h('p', { class: 'soluk kucuk giris-ozel-not' }, OZEL_ACIKLAMA[a.islem]));
        break;
      case 'git': {
        const adresi = girdi('Adres', 'adres', '/yol ya da tam adres');
        // Yol ortamın taban adresine göre çözülür: taban adres salt okunur önek olarak yanında (tam adres yazılırsa önek gizlenir).
        const kok = (() => { try { return s.taban && s.taban.url ? new URL(s.taban.url).origin : ''; } catch { return ''; } })();
        if (kok) {
          const giris = adresi.querySelector('input');
          const onek = h('span', { class: 'adres-oneki', 'data-taban-adres': '', title: `Ortamın taban adresi${s.taban.ad ? ` (${s.taban.ad})` : ''}; değiştirilemez` }, kok);
          const kap = h('div', { class: 'adres-girdisi' });
          const tam = h('small', { class: 'soluk', 'data-tam-adres': '' });
          const goster = () => {
            const yol = String(a.adres ?? '');
            const goreli = yol === '' || yol.startsWith('/');
            onek.hidden = !goreli;
            tam.textContent = goreli ? `Tam adres: ${kok}${yol}${s.taban.ad ? ` (ortam: ${s.taban.ad})` : ''}` : `Tam adres: ${yol}`;
          };
          giris.replaceWith(kap);
          kap.append(onek, giris);
          adresi.append(tam);
          giris.addEventListener('input', goster);
          goster();
        }
        govde.append(adresi);
        break;
      }
      case 'adresBekle': govde.append(girdi('Adres deseni', 'desen', 'Düzenli ifade')); break;
      case 'bekle': govde.append(girdi('Saniye', 'saniye', '1–300 arası. Sayfa bir şey göstermeden önce sabit süre bekler; mümkünse "Görünmesini bekle" ya da "Adresi bekle" daha güvenilirdir.')); break;
      case 'kosulBekle': govde.append(girdi('Sayfa koşulu (JavaScript)', 'ifade', 'ör. window.hazir === true — yer tutucu içeremez')); break;
      case 'tikla':
        govde.append(...hedefAlanlari());
        govde.append(girdi('Beklenen yanıt yolu', '_yanitYolu', 'İsteğe bağlı: tıklamayla gelen yanıtın yolu', a));
        govde.append(girdi('Sonraki adres deseni', 'adresBekle', 'İsteğe bağlı'));
        break;
      case 'doldur': case 'sec': case 'degerBekle':
        govde.append(...hedefAlanlari(), girdi(a.islem === 'degerBekle' ? 'Beklenen değer' : 'Değer', 'deger', s.degerYardimi));
        break;
      case 'sayiBekle': govde.append(...hedefAlanlari(), girdi('Beklenen sayı', 'sayi')); break;
      case 'metinBekle': govde.append(...hedefAlanlari(), girdi('Beklenen metin', 'metin')); break;
      default: govde.append(...hedefAlanlari());
    }
    const tasi = (yon) => { const j = i + yon; if (j < 0 || j >= adimlar.length) return; [adimlar[i], adimlar[j]] = [adimlar[j], adimlar[i]]; ciz(); };
    return h('li', { class: s.ogeSinifi },
      h('div', { class: 'tarif-adim-ust' }, h('span', { class: 'tarif-adim-no sayi', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), islem,
        girdi('Açıklama', 'aciklama', null),
        h('div', { class: 'tarif-adim-eylemleri' },
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${no}: yukarı taşı`, disabled: i === 0, onclick: () => tasi(-1) }, ikon('asagi', 'yukari')),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${no}: aşağı taşı`, disabled: i === adimlar.length - 1, onclick: () => tasi(1) }, ikon('asagi')),
          h('button', { type: 'button', class: 'ikon-dugme hayalet', 'aria-label': `${no}: kaldır`, onclick: () => { adimlar.splice(i, 1); ciz(); } }, ikon('cop')))),
      govde);
  };
  ciz();
  return { liste, ciz };
}

/**
 * Giriş profilleri sayfasının altına tarif bölümünü çizer.
 * @param {HTMLElement} kapsayici @param {{ durum: any }} baglam
 */
export async function girisTarifiBolumu(kapsayici, baglam) {
  const proje = baglam.durum.proje;
  const veri = await api(`/platform/giris-tarifleri?projeId=${encodeURIComponent(proje.id)}`);
  // Kurulumda (ya da Başlarken'de) "Giriş gerekmiyor" seçildiyse tarifsiz ortam "Tanımlı değil" uyarısı yerine bunu söyler.
  let girisGerekmez = await api(`/platform/baslarken?projeId=${encodeURIComponent(proje.id)}`)
    .then((y) => Boolean(y.baslarken?.adimlar?.find((a) => a.anahtar === 'giris')?.atlandi)).catch(() => false);
  const girisGerekmezGeriAl = async (/** @type {HTMLButtonElement} */ dugme) => {
    dugme.disabled = true;
    try {
      await api('/platform/baslarken/kaydet', { govde: { projeId: proje.id, girisGerekmez: false } });
      girisGerekmez = false;
      ciz();
      bildir('"Giriş gerekmiyor" seçimi geri alındı; tarifsiz ortamlarda giriş yapılamaz.');
    } catch (e) { dugme.disabled = false; if (!(e && e.durum === 423)) bildir(e.message || String(e), 'hata'); }
  };
  const girisIslemleri = veri.girisAdimIslemleri || [
    { islem: 'kullaniciAdi', etiket: 'Kullanıcı adını yaz' }, { islem: 'parola', etiket: 'Parolayı yaz' }, { islem: 'gonder', etiket: 'Giriş düğmesine bas' },
    ...veri.adimIslemleri
  ];
  const formAlani = h('div', {});
  const liste = h('ul', { class: 'kayit-listesi' });
  /**
   * Açık form (tarif formu / giriş kaydı) hangi ortamın? Kartlar formun ALTINDA durduğu için düzenlenen ortamın kartı da
   * işaretlenir: çerçeve + "Yukarıda düzenleniyor" rozeti (aria-current). Form kapanınca işaret kalkar.
   */
  const duzenleneniIsaretle = () => {
    const acik = /** @type {HTMLElement | null} */ (formAlani.querySelector('[data-ortam]'));
    const id = acik ? acik.getAttribute('data-ortam') : null;
    for (const li of liste.querySelectorAll(':scope > li[data-ortam]')) {
      const bu = li.getAttribute('data-ortam') === id;
      li.classList.toggle('duzenleniyor', bu);
      if (bu) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
      const eski = li.querySelector('.duzenleniyor-rozeti');
      if (bu && !eski) li.querySelector('.kayit-ana > strong')?.append(' ', h('span', { class: 'rozet vurgu duzenleniyor-rozeti' }, ikon('asagi', 'yukari'), 'Yukarıda düzenleniyor'));
      if (!bu && eski) eski.remove();
    }
  };
  new MutationObserver(() => duzenleneniIsaretle()).observe(formAlani, { childList: true });
  const ciz = () => {
    liste.replaceChildren(...veri.ortamlar.map((o) => {
      const gerekmiyor = !o.tarif && girisGerekmez;
      const [rozetMetni, rozetTuru] = gerekmiyor ? ['Giriş gerekmiyor', ''] : KAYNAK_ROZETI[o.kaynak] || KAYNAK_ROZETI.yok;
      return h('li', { 'data-ortam': o.ortamId },
        h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('anahtar')),
        h('div', { class: 'kayit-ana' }, h('strong', {}, o.ortamAd, ' ', rozet(rozetMetni, rozetTuru)),
          gerekmiyor
            ? h('div', { class: 'kayit-meta giris-gerekmiyor' }, 'Giriş gerekmiyor (kurulumda seçildi) · ',
              h('button', { type: 'button', class: 'baglanti-dugmesi', 'aria-label': `Tarif tanımla — ${o.ortamAd} giriş tarifi`, onclick: () => tarifFormu(o) }, 'Tarif tanımla'), ' · ',
              h('button', { type: 'button', class: 'baglanti-dugmesi', onclick: (ev) => girisGerekmezGeriAl(/** @type {HTMLButtonElement} */ (ev.currentTarget)) }, 'Geri al'))
            : h('div', { class: 'kayit-meta' }, ozet(o.tarif)),
          o.tarif ? h('div', { class: 'kayit-meta giris-ozet-satiri' }, girisAdimlariOzeti(o.tarif).map((x, i) => `${i + 1}. ${x.metin}`).join(' · ')) : null,
          o.hatalar && o.hatalar.length ? h('div', { class: 'kayit-meta hata-metni' }, `Tarif geçersiz: ${o.hatalar.join(' ')}`) : null,
          o.tarif && oturumAdresiGirisleAyniMi(o.tarif, o.tabanUrl)
            ? h('div', { class: 'kayit-meta oturum-adresi-uyarisi' }, ikon('uyari'), ' Oturum kontrol adresi giriş sayfasıyla aynı: her testte giriş beklenir (Düzenle’de düzeltin).') : null),
        h('div', { class: 'kayit-eylemleri' },
          // Önerilen yol "Girişi kaydet" (tarif yoksa birincil); elle tanımlama gelişmiş seçenek olarak yanında durur.
          // Erişilebilir ad görünen metinle başlar (sesli komut / ekran okuyucu): "Elle tanımla — TEST giriş tarifi".
          h('button', { type: 'button', class: o.tarif ? 'kucuk-dugme hayalet' : 'kucuk-dugme birincil', 'aria-label': `${o.tarif ? 'Yeniden kaydet' : 'Girişi kaydet'} — ${o.ortamAd} girişi`, onclick: () => girisiKaydet(o) },
            ikon('oynat'), o.tarif ? 'Yeniden kaydet' : 'Girişi kaydet'),
          o.tarif ? girisiDeneDugmesi(o, proje.id, { tarifGuncellendi: guncelle }) : null,
          (o.tarif ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `Düzenle — ${o.ortamAd} giriş tarifi`, onclick: () => tarifFormu(o) }, ikon('duzenle'), 'Düzenle')
            : h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `Elle tanımla — ${o.ortamAd} giriş tarifi`, onclick: () => tarifFormu(o) }, 'Elle tanımla'))));
    }));
    duzenleneniIsaretle();
  };
  const guncelle = (yeni) => {
    const i = veri.ortamlar.findIndex((x) => x.ortamId === yeni.ortamId);
    if (i >= 0) veri.ortamlar[i] = yeni;
    ciz();
  };
  /** Bu ortamın (yoksa tüm ortamların) giriş profilini düzenlemeye açar; profil yoksa profil ekleme düğmesine basar. */
  const profiliAc = (ortamAd) => {
    const ust = kapsayici.parentElement;
    const satirlar = [...(ust?.querySelectorAll(':scope > .kayit-listesi > li') || [])];
    const uygun = satirlar.find((li) => (li.querySelector('.kayit-meta')?.textContent || '').startsWith(`${ortamAd} ·`))
      || satirlar.find((li) => (li.querySelector('.kayit-meta')?.textContent || '').startsWith('Tüm ortamlar ·'));
    const dugme = /** @type {HTMLButtonElement | null} */ (uygun ? uygun.querySelector('button[aria-label$=": düzenle"]') : ust?.querySelector('.bolum-basligi .birincil'));
    if (dugme) { dugme.scrollIntoView({ block: 'center' }); dugme.click(); }
  };

  /** @param {any} o ortam satırı @param {{ tarif?: any; not?: string; oturumOnerisi?: string | null }} [on] kayıttan gelen öneri (kaydedilmemiş) */
  const tarifFormu = (o, on = {}) => {
    const t = JSON.parse(JSON.stringify(on.tarif || o.tarif || bosTarif()));
    const mesaj = mesajKutusu();
    const girisAdresi = monoGirdi(t.girisAdresi, { placeholder: '/giris' });
    const oturumAdresi = monoGirdi(t.oturumKontrolAdresi, { placeholder: 'Boş: giriş sonrası açılan sayfa otomatik bulunur' });
    // Oturum kontrol adresi giriş sayfasıyla aynıysa açık uyarı; önerilen adres (girişten sonra görülen sayfa) varsa tek tıkla geçilir.
    // Öneri kaynağı: kayıttan gelen öneri > bu oturumda "Girişi dene"/"Girişi kaydet"te görülen sayfa > adres deseni başarı göstergesi.
    const oturumUyarisi = h('div', { class: 'not-kutusu uyari oturum-adresi-uyarisi', role: 'status', hidden: true });
    let oturumUyarisiniGuncelle = () => {};
    const kullanici = monoGirdi(t.kullaniciAlani);
    const parola = monoGirdi(t.parolaAlani);
    const gonder = monoGirdi(t.gonderDugmesi);

    // --- Adres alanları: yol ya da TAM adres (ortamın kökeniyle aynıysa taban adres + yol olarak ayrılır) ------------------
    const adresNotu = h('div', { role: 'status', 'aria-live': 'polite' });
    const tabanAdresleri = () => (o.tabanAdresleri && o.tabanAdresleri.length ? o.tabanAdresleri : [o.tabanUrl]);
    /** Alandaki değerin tarife yazılacak biçimi: ortamın kökenindeyse yol, başka kökse tam adres, geçersizse yazıldığı gibi (sunucu doğrular). */
    const adresDegeri = (girdi) => { const s = adresiAyir(girdi.value, o.tabanUrl); return s.tur === 'hata' ? girdi.value.trim() : s.adres; };
    /** Girişten sonra açılan sayfa (kayıttan / bu oturumdaki denemeden / adres deseni başarı göstergesinden) → boş oturum kontrol adresinin otomatik değeri. */
    const otomatikOturum = () => {
      const adresler = { girisAdresi: adresDegeri(girisAdresi) || '/', oturumKontrolAdresi: '' };
      return [on.oturumOnerisi, hatirlananGirisSonrasiSayfasi(o.ortamId), basariAdresindenYol({ tur: basariTur.value, deger: basariDeger.value })]
        .map((y) => oturumAdresiOnerisi(adresler, y, o.tabanUrl)).find(Boolean) || '';
    };
    const tabanAdresiniOner = async (koken) => {
      const tamam = await onayIste({
        baslik: 'Bu adresi yeni taban adres olarak kaydedeyim mi?',
        metin: `${koken} adresi bu ortamın taban adresinden (${o.tabanUrl}) farklı bir sitede. Kaydedersem ortamın taban adresleri listesine eklenir (ekran ve servis eklerken seçilebilir; ortamın asıl adresi değişmez). Kaydetmezsem adres yalnız burada tam adres olarak kalır.`,
        dugme: 'Evet, kaydet', ikonAd: 'ag'
      });
      if (!tamam) { adresNotu.replaceChildren(h('div', { class: 'not-kutusu uyari' }, `${koken} taban adres olarak kaydedilmedi; adres tam adres olarak kalır.`)); return; }
      try {
        const { ortam } = await api('/platform/giris-tarifi/taban-adresi-ekle', { govde: { projeId: proje.id, ortamId: o.ortamId, adres: koken } });
        o.tabanAdresleri = ortam.tabanAdresleri;
        adresNotu.replaceChildren(h('div', { class: 'not-kutusu basari', role: 'status' }, `${koken} taban adres olarak kaydedildi.`));
      } catch (hata) { adresNotu.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); }
    };
    const adresiIsle = async (girdi) => {
      const s = adresiAyir(girdi.value, o.tabanUrl);
      alanHatasi(girdi, s.tur === 'hata' ? s.mesaj : '');
      if (s.tur === 'yol' && s.yol && s.yol !== girdi.value.trim()) girdi.value = s.yol;
      if (s.tur === 'ayni') {
        girdi.value = s.yol;
        adresNotu.replaceChildren(h('div', { class: 'not-kutusu bilgi' }, `Tam adres ayrıldı: taban adres ${o.tabanUrl} + yol ${s.yol}.`));
      } else if (s.tur === 'baska') {
        girdi.value = s.adres;
        if (kokenKayitliMi(s.koken, tabanAdresleri())) adresNotu.replaceChildren(h('div', { class: 'not-kutusu bilgi' }, `${s.koken} ortamın kayıtlı taban adreslerinden; tam adres olarak kalır.`));
        else await tabanAdresiniOner(s.koken);
      } else adresNotu.replaceChildren();
      ozetiCiz();
      oturumUyarisiniGuncelle();
    };
    girisAdresi.addEventListener('change', () => { void adresiIsle(girisAdresi); });
    oturumAdresi.addEventListener('change', () => { void adresiIsle(oturumAdresi); });

    // --- Analiz et (yalnızca açık istek + onay): giriş sayfasını açar, alanları BULUR; hiçbir şey doldurmaz, göndermez, düğmeye basmaz ------
    const oneriNotu = h('div', { role: 'status' });
    const oner = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('simsek'), 'Analiz et');
    oner.addEventListener('click', async () => {
      const yol = adresDegeri(girisAdresi) || '/';
      let adres = yol;
      try { adres = new URL(yol, o.tabanUrl).toString(); } catch { /* sunucu doğrular */ }
      const tamam = await onayIste({
        baslik: 'Giriş sayfası analiz edilsin mi?',
        metin: `Nöbetçi, ${adres} adresini bu bilgisayarda görünmez bir tarayıcıda açıp sayfadaki kullanıcı adı, parola ve giriş düğmesini bulacak. Hiçbir alan doldurulmaz, hiçbir düğmeye basılmaz, hiçbir şey gönderilmez; yine de sitenin sunucusuna bir sayfa isteği gider.`,
        dugme: 'Sayfayı aç ve analiz et', ikonAd: 'ag'
      });
      if (!tamam) return;
      if (!(await canliOnayIste({ id: o.ortamId, ad: o.ortamAd, riskli: o.riskli, canli: o.canli }, 'Giriş sayfası analizi'))) return;
      oneriNotu.replaceChildren();
      try {
        const { oneri } = await mesgulIken(oner, 'Sayfa inceleniyor…', () => api('/platform/giris-tarifi/oner', {
          govde: { projeId: proje.id, ortamId: o.ortamId, girisAdresi: adresDegeri(girisAdresi), onay: true, ...canliOnayEki(o.ortamId) }
        }));
        if (oneri.captcha && oneri.captcha.length) {
          oneriNotu.replaceChildren(h('div', { class: 'not-kutusu hata' }, 'Sayfada CAPTCHA algılandı. Test ortamında CAPTCHA kapatılmalı; otomasyon CAPTCHA çözmez.'));
        }
        if (!oneri.bulundu) {
          oneriNotu.append(h('div', { class: 'not-kutusu uyari' }, oneri.neden || 'Giriş formu bulunamadı.'));
          return;
        }
        if (oneri.kullaniciAlani) kullanici.value = oneri.kullaniciAlani;
        if (oneri.parolaAlani) parola.value = oneri.parolaAlani;
        if (oneri.gonderDugmesi) gonder.value = oneri.gonderDugmesi;
        ozetiCiz();
        oneriNotu.append(h('div', { class: 'not-kutusu basari' },
          h('p', {}, 'Analiz bitti: kullanıcı adı, parola ve giriş düğmesi alanlara yazıldı; kaydetmeden önce kontrol edin. Girişten sonra görünen yazıyı siz belirleyin (ya da “Girişi kaydet” ile Nöbetçi görsün).'),
          oneri.notlar && oneri.notlar.length ? h('ul', {}, oneri.notlar.map((n) => h('li', {}, n))) : null));
      } catch (hata) {
        oneriNotu.replaceChildren(h('div', { class: 'not-kutusu hata' }, hata.message));
      }
    });

    // --- Giriş adımları (okunur özet + düzenleyici) ------------------------------------------
    const girisAdimlari = (Array.isArray(t.girisAdimlari) && t.girisAdimlari.length ? t.girisAdimlari : VARSAYILAN_GIRIS_ADIMLARI).map((a) => JSON.parse(JSON.stringify(a)));
    const ozetKutusu = h('div', { class: 'giris-ozet', 'aria-live': 'polite' });
    const girisAdimSayisi = h('span', {});
    let ozetiCiz = () => {};
    const girisDuzenleyici = adimDuzenleyici({
      adimlar: girisAdimlari, islemler: girisIslemleri, onEk: 'Giriş adımı', ogeSinifi: 'giris-adimi',
      degerYardimi: '{ad} = giriş profilinin ek alanı (ör. {firmaKodu})', degisti: () => ozetiCiz(), taban: { url: o.tabanUrl, ad: o.ortamAd }
    });
    const girisAdimEkle = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('arti'), 'Giriş adımı ekle');
    girisAdimEkle.addEventListener('click', () => { girisAdimlari.push({ islem: 'doldur', hedef: { secici: '' }, deger: '' }); girisDuzenleyici.ciz(); });
    const ekAlanCipleri = h('div', { class: 'yer-tutucu-cipleri' },
      veri.ekAlanAdlari && veri.ekAlanAdlari.length
        ? [h('span', { class: 'soluk kucuk' }, 'Giriş profillerindeki ek alanlar:'), ...veri.ekAlanAdlari.map((a) => h('code', {}, `{${a}}`))]
        : [h('span', { class: 'soluk kucuk' }, 'Ek alan (ör. firma kodu, şube, PIN) gerekiyorsa değerini giriş profiline “Ek alan” olarak ekleyin ve adımda {ad} yazın.')]);

    // --- Başarı / hata göstergeleri -------------------------------------------------------
    const basariTur = h('select', {}, [['metin', 'Sayfada görünen metin (tam eşleşme)'], ['url', 'Adres deseni (düzenli ifade)'], ['eleman', 'Öğe (seçici)']]
      .map(([d, m]) => h('option', { value: d, selected: t.basariGostergesi.tur === d }, m)));
    const basariDeger = monoGirdi(t.basariGostergesi.deger);
    const hataSatirlari = [];
    const hataKutusu = h('div', {});
    const hataEkle = (g = { tur: 'metin', deger: '' }) => {
      const tur = h('select', { 'aria-label': 'Hata göstergesi türü' }, [['metin', 'Metin'], ['eleman', 'Öğe (seçici)']].map(([d, m]) => h('option', { value: d, selected: g.tur === d }, m)));
      const deger = monoGirdi(g.deger, { 'aria-label': 'Hata göstergesi' });
      const s = { tur, deger, el: null };
      s.el = h('div', { class: 'gosterge-satiri' }, tur, deger,
        h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': 'Bu hata göstergesini kaldır', onclick: () => { hataSatirlari.splice(hataSatirlari.indexOf(s), 1); s.el.remove(); } }, ikon('carpi')));
      hataSatirlari.push(s);
      hataKutusu.append(s.el);
    };
    (t.hataGostergeleri || []).forEach(hataEkle);
    const zamanAsimi = h('input', { type: 'number', min: '5', max: '600', step: '1', value: String(t.zamanAsimiSn ?? 45) });

    let sonUyariDurumu = '';
    oturumUyarisiniGuncelle = () => {
      const adresler = { girisAdresi: adresDegeri(girisAdresi) || '/', oturumKontrolAdresi: adresDegeri(oturumAdresi) };
      const otomatik = otomatikOturum();
      oturumAdresi.placeholder = otomatik ? `Boş: otomatik (${otomatik})` : 'Boş: giriş sonrası açılan sayfa otomatik bulunur (“Girişi dene” ile)';
      // Boş alan hata değildir: kaydederken giriş sonrası açılan sayfa (biliniyorsa) otomatik yazılır.
      const ayni = oturumAdresiGirisleAyniMi(adresler, o.tabanUrl) && (Boolean(oturumAdresi.value.trim()) || Boolean(o.tarif && !otomatik));
      const oneri = ayni ? [on.oturumOnerisi, hatirlananGirisSonrasiSayfasi(o.ortamId), basariAdresindenYol({ tur: basariTur.value, deger: basariDeger.value })]
        .map((y) => oturumAdresiOnerisi(adresler, y, o.tabanUrl)).find(Boolean) || null : null;
      const durum = ayni ? `ayni:${oneri ?? ''}` : '';
      if (durum === sonUyariDurumu) return;
      sonUyariDurumu = durum;
      oturumUyarisi.hidden = !ayni;
      if (!ayni) { oturumUyarisi.replaceChildren(); return; }
      gelismisAyarlar.open = true;
      oturumUyarisi.replaceChildren(
        h('p', {}, h('strong', {}, AYNI_ADRES_UYARISI)),
        oneri
          ? h('p', {}, `Girişten sonra açılan sayfa: `, h('code', {}, oneri), ' ',
            h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => { oturumAdresi.value = oneri; oturumUyarisiniGuncelle(); oturumAdresi.focus(); } }, `Önerilen adrese geç (${oneri})`))
          : h('p', { class: 'kucuk' }, 'Girişten sonra açılan sayfanın yolunu yazın (ör. /panel). Bilmiyorsanız “Girişi dene” ile deneyin: giriş sonrası sayfa önerilir.'));
    };

    // --- İkinci adım ----------------------------------------------------------------------
    const ikinci = t.ikinciAdim || { tur: 'yok' };
    const ad = yeniKimlik('ikinci');
    const radyo = (deger, metin) => {
      const r = h('input', { type: 'radio', name: ad, value: deger, id: yeniKimlik('r'), checked: ikinci.tur === deger });
      return { r, etiket: h('label', { class: 'secenek', for: r.id }, r, metin) };
    };
    const rYok = radyo('yok', 'Yok — kullanıcı adı ve parola yeterli');
    const rTotp = radyo('totp', 'Authenticator (TOTP) — kod giriş profilindeki anahtardan üretilir');
    const rSms = radyo('sms', 'SMS — kod telefona gelir');
    const kodAlani = monoGirdi(ikinci.kodAlani || '');
    const kodGonder = monoGirdi(ikinci.gonderDugmesi || '');
    const smsAd = yeniKimlik('sms');
    const smsRadyo = (deger, metin) => {
      const r = h('input', { type: 'radio', name: smsAd, value: deger, id: yeniKimlik('s'), checked: (ikinci.smsKipi ?? '') === deger });
      return { r, etiket: h('label', { class: 'secenek', for: r.id }, r, metin) };
    };
    const sProfil = smsRadyo('', 'Giriş profilindeki ayarı kullan');
    const sSabit = smsRadyo('sabit', 'Sabit test kodu (giriş profilinde kayıtlı)');
    const sElle = smsRadyo('elle', 'Koşu sırasında elle girilir');
    const elleSure = h('input', { type: 'number', min: '15', max: '1800', step: '5', value: String(ikinci.elleBeklemeSn ?? 180) });
    const smsAlani = h('div', { class: 'ic-alanlar' },
      h('div', { class: 'secenek-grubu', role: 'radiogroup', 'aria-label': 'SMS kodunun kaynağı' }, sProfil.etiket, sSabit.etiket, sElle.etiket),
      h('div', { class: 'not-kutusu bilgi' },
        h('p', {}, h('strong', {}, 'Elle kipi: '), 'Nöbetçi’den başlatılan koşularda giriş SMS kodu isteyince canlı koşu panelinde bir kod kutusu açılır; telefonunuza gelen kodu oraya yazarsınız.'),
        h('p', {}, 'Kod aşağıdaki süre içinde girilmezse giriş “Doğrulama kodu alınamadı” hatasıyla durur. Gözetimsiz (planlı) koşular için sabit test kodu tanımlayın.')),
      alan('Kod bekleme süresi (sn)', elleSure, { yardim: '15–1800 saniye.' }));
    const kodAlanlari = h('div', { class: 'ic-alanlar' },
      alan('Kod alanı', kodAlani, { yardim: `Boş bırakılırsa kod alanı giriş sonrası sayfadan otomatik bulunur (tek kullanımlık kod alanına benzeyen alan). ${SECICI_YARDIMI}` }),
      alan('Kod gönder düğmesi', kodGonder, { yardim: 'Boş bırakılırsa giriş düğmesi kullanılır.' }),
      smsAlani);
    // Kodun kaynağı giriş PROFİLİNDEDİR (kasada şifreli): tarif yalnız kod alanını ve düğmesini tanımlar.
    const profilBaglantisi = (metin) => h('button', { type: 'button', class: 'bag-dugme', onclick: () => profiliAc(o.ortamAd) }, metin);
    const totpNotu = h('div', { class: 'not-kutusu bilgi kucuk ikinci-adim-notu', role: 'note' },
      h('p', {}, h('strong', {}, 'Gizli anahtar giriş profilinde tanımlanır '), '(kasada şifreli): Ayarlar > Giriş profilleri > profil > "Authenticator gizli anahtarı". ',
        profilBaglantisi('Profili aç')),
      h('p', { class: 'soluk' }, 'Anahtarı bulmak için: uygulamanın iki aşamalı doğrulama kurulumunda QR kodun altındaki "elle gir" / "kodu tarayamıyorum" bağlantısının gösterdiği metin.'));
    const smsNotu = h('div', { class: 'not-kutusu bilgi kucuk ikinci-adim-notu', role: 'note' },
      h('p', {}, h('strong', {}, 'SMS kodunun kaynağı giriş profilinde tanımlanır: '), 'Ayarlar > Giriş profilleri > profil > "Doğrulama kodu: SMS" (sabit test kodu ya da koşu sırasında elle girilir). Aşağıdaki seçim bu ortam için profildeki ayarı geçersiz kılabilir. ',
        profilBaglantisi('Profili aç')));
    const ikinciGorunum = () => {
      kodAlanlari.hidden = rYok.r.checked;
      smsAlani.hidden = !rSms.r.checked;
      totpNotu.hidden = !rTotp.r.checked;
      smsNotu.hidden = !rSms.r.checked;
      ozetiCiz();
    };
    [rYok.r, rTotp.r, rSms.r].forEach((r) => r.addEventListener('change', ikinciGorunum));

    // --- Bağlam değiştirme ----------------------------------------------------------------
    const baglamVar = h('input', { type: 'checkbox', id: yeniKimlik('baglam'), checked: Boolean(t.baglamDegistirme) });
    const baglamTuru = oneriListesi(h('input', { type: 'text', value: t.baglamDegistirme ? t.baglamDegistirme.baglamTuru : '' }), () => veri.baglamTurleri.map((x) => x.tur));
    const alanCipleri = h('div', { class: 'yer-tutucu-cipleri', 'aria-live': 'polite' });
    const cipleriCiz = () => {
      const tur = veri.baglamTurleri.find((x) => x.tur === baglamTuru.value.trim());
      const ogeler = tur && tur.alanlar.length
        ? [h('span', { class: 'soluk kucuk' }, 'Kullanılabilir yer tutucular:'), ...tur.alanlar.map((a) => h('code', {}, `{${a}}`))]
        : [h('span', { class: 'soluk kucuk' }, 'Bu türde bağlam profili yok; yer tutucular profil alan adlarıyla yazılır, ör. {subeKodu}.')];
      alanCipleri.replaceChildren(...ogeler);
    };
    baglamTuru.addEventListener('input', cipleriCiz);
    cipleriCiz();
    const adimlar = t.baglamDegistirme ? t.baglamDegistirme.adimlar.map((a) => JSON.parse(JSON.stringify(a))) : [];
    const adimOzetMetni = h('span', {});
    const baglamDuzenleyici = adimDuzenleyici({
      adimlar, islemler: veri.adimIslemleri, onEk: 'Adım', ogeSinifi: 'tarif-adim', degerYardimi: '{alan} yer tutucusu kullanılabilir', taban: { url: o.tabanUrl, ad: o.ortamAd },
      degisti: () => { adimOzetMetni.textContent = `Adımlar (${adimlar.length})`; ozetiCiz(); }
    });
    const adimEkle = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('arti'), 'Adım ekle');
    adimEkle.addEventListener('click', () => { adimlar.push({ islem: 'tikla', hedef: { secici: '' } }); baglamDuzenleyici.ciz(); });
    const baglamAlani = h('div', { class: 'ic-alanlar' },
      alan('Bağlam türü', baglamTuru, { yardim: 'Adımlardaki {alan} yer tutucuları bu türdeki seçilen bağlam profilinin alanlarıyla doldurulur.' }),
      alanCipleri,
      h('details', { class: 'tarif-adim-kutusu', open: adimlar.length <= 6 },
        h('summary', {}, adimOzetMetni), baglamDuzenleyici.liste, h('div', { class: 'dugmeler' }, adimEkle)));
    const baglamGorunum = () => { baglamAlani.hidden = !baglamVar.checked; ozetiCiz(); };
    baglamVar.addEventListener('change', baglamGorunum);

    // --- Her girişte çalışacak akış: kullanıcının akışlarından (genel senaryo) seçilir; istediği alanların değerleri burada yazılır.
    const akislar = Array.isArray(veri.akislar) ? veri.akislar : [];
    const gs = t.girisSonrasiAkis || null;
    const akisSecimi = h('select', { id: yeniKimlik('giris-sonrasi-akis') }, h('option', { value: '' }, 'Yok'),
      akislar.map((x) => h('option', { value: x.dosya, selected: gs && gs.dosya === x.dosya ? true : null }, x.ad)),
      gs && !akislar.some((x) => x.dosya === gs.dosya) ? h('option', { value: gs.dosya, selected: true }, `${gs.dosya.replace(/\.model\.json$/, '')} (bulunamadı)`) : null);
    /** @type {Record<string, string>} */
    const akisDegerleri = { ...(gs && gs.degerler ? gs.degerler : {}) };
    /** @type {Array<{ anahtar: string; etiket: string; girdi: HTMLInputElement | HTMLSelectElement }>} */
    let akisGirdileri = [];
    const akisAlanlari = h('div', { class: 'ic-alanlar' });
    const akisAlanlariniCiz = () => {
      const a = akislar.find((x) => x.dosya === akisSecimi.value);
      akisGirdileri = [];
      akisAlanlari.hidden = !a;
      if (!a) { akisAlanlari.replaceChildren(); return; }
      akisAlanlari.replaceChildren(
        a.alanlar.length ? h('p', { class: 'soluk kucuk' }, `“${a.ad}” akışı şu değerleri istiyor:`) : h('p', { class: 'soluk kucuk' }, 'Bu akış değer istemiyor.'),
        ...a.alanlar.map((f) => {
          const girdi = Array.isArray(f.secenekler) && f.secenekler.length
            ? h('select', {}, h('option', { value: '' }, 'Seçin'), f.secenekler.map((x) => h('option', { value: x.deger, selected: akisDegerleri[f.anahtar] === x.deger ? true : null }, x.metin)))
            : h('input', { type: 'text', autocomplete: 'off', value: akisDegerleri[f.anahtar] || '' });
          const yaz = () => { akisDegerleri[f.anahtar] = girdi.value; };
          girdi.addEventListener('input', yaz);
          girdi.addEventListener('change', yaz);
          akisGirdileri.push({ anahtar: f.anahtar, etiket: f.etiket, girdi });
          return alan(f.etiket, girdi, { zorunlu: true });
        }));
    };
    akisSecimi.addEventListener('change', () => { akisAlanlariniCiz(); ozetiCiz(); });
    akisAlanlariniCiz();
    const akisBolumu = h('fieldset', { class: 'giris-sonrasi-akis' }, h('legend', {}, 'Her girişte çalışacak akış (isteğe bağlı)'),
      h('p', { class: 'soluk kucuk' }, 'Girişten sonra, ekran açılmadan önce her seferinde çalışır (ör. kullanıcı / acente değiştirme). Akışlarınızdan seçin ve istediği değerleri yazın. Ekran değişirse yeni akış oluşturup burada seçmeniz yeter. Bir senaryonun akışında aynı akış varsa senaryodaki çalışır, bu atlanır.'),
      alan('Akış', akisSecimi, { yardim: akislar.length ? 'Ekranlar > Genel senaryolar’daki akışlar.' : 'Henüz genel senaryo yok (Ekranlar > Ekran ekle > Genel senaryo).' }),
      akisAlanlari);

    // --- Toplama + kaydetme ---------------------------------------------------------------
    const topla = () => {
      const tur = rTotp.r.checked ? 'totp' : rSms.r.checked ? 'sms' : 'yok';
      const giris = adimlariTemizle(girisAdimlari);
      const sonuc = {
        girisAdresi: adresDegeri(girisAdresi) || '/',
        oturumKontrolAdresi: oturumAdresi.value.trim() ? adresDegeri(oturumAdresi) : otomatikOturum(),
        kullaniciAlani: kullanici.value.trim(),
        parolaAlani: parola.value.trim(),
        gonderDugmesi: gonder.value.trim(),
        basariGostergesi: { tur: basariTur.value, deger: basariDeger.value.trim() },
        hataGostergeleri: hataSatirlari.map((s) => ({ tur: s.tur.value, deger: s.deger.value.trim() })).filter((g) => g.deger),
        zamanAsimiSn: Number(zamanAsimi.value) || 45,
        ikinciAdim: tur === 'yok' ? { tur } : {
          tur, kodAlani: kodAlani.value.trim(), gonderDugmesi: kodGonder.value.trim(),
          smsKipi: tur === 'sms' ? (sSabit.r.checked ? 'sabit' : sElle.r.checked ? 'elle' : null) : null,
          hataGostergeleri: ikinci.hataGostergeleri || [], elleBeklemeSn: Number(elleSure.value) || 180
        },
        baglamDegistirme: baglamVar.checked ? { baglamTuru: baglamTuru.value.trim(), adimlar: adimlariTemizle(adimlar) } : null
      };
      if (akisSecimi.value) {
        const istenen = akislar.find((x) => x.dosya === akisSecimi.value);
        const anahtarlar = istenen ? istenen.alanlar.map((f) => f.anahtar) : Object.keys(akisDegerleri);
        sonuc.girisSonrasiAkis = { dosya: akisSecimi.value, degerler: Object.fromEntries(anahtarlar.filter((k) => akisDegerleri[k]).map((k) => [k, String(akisDegerleri[k]).trim()])) };
      }
      // Varsayılan sıra (kullanıcı adı → parola → giriş düğmesi) tarife yazılmaz: eski tariflerle aynı biçim kalır.
      if (!varsayilanMi(giris)) sonuc.girisAdimlari = giris;
      return sonuc;
    };
    ozetiCiz = () => {
      let tarif;
      try { tarif = topla(); } catch { return; }
      girisAdimSayisi.textContent = `Adımları düzenle (${girisAdimlari.length})`;
      ozetKutusu.replaceChildren(h('p', { class: 'kucuk soluk' }, 'Giriş şöyle yapılır:'), okunurAdimlar(tarif));
    };

    const kaydet = h('button', { type: 'submit', class: 'birincil' }, 'Tarifi kaydet');
    const sifirla = o.kaynak === 'kayitli'
      ? h('button', { type: 'button', class: 'hayalet' }, ikon('geri'), 'Kayıtlı tarifi sil')
      : null;
    // Önce ZORUNLU olanlar (adres, kullanıcı adı / parola alanı, giriş düğmesi, başarı göstergesi); gerisi kapalı "Gelişmiş ayarlar".
    const zorunluBolum = h('fieldset', { class: 'giris-zorunlu' }, h('legend', {}, 'Giriş sayfası'),
      h('p', { class: 'soluk kucuk' }, 'Yalnız bu bölüm zorunludur. “Analiz et” kullanıcı adı, parola ve giriş düğmesini sizin yerinize bulur.'),
      alan('Giriş sayfasının adresi', girisAdresi, { yardim: 'Ortamın adresinden sonraki yol (ör. /giris) ya da tam adres; tam adresi Nöbetçi taban adres + yol olarak ayırır.' }),
      adresNotu,
      h('div', { class: 'oneri-satiri' }, oner,
        h('span', { class: 'soluk kucuk' }, ikon('uyari'), ' Giriş sayfasını bu bilgisayarda açıp alanları bulur; hiçbir şey doldurmaz ya da göndermez. Yalnızca siz basınca çalışır.')),
      oneriNotu,
      alan('Kullanıcı adı alanı', kullanici, { zorunlu: true, yardim: 'Kullanıcı adının yazıldığı kutu. Örnek: #kullanici ya da input[name="kullanici"].' }),
      alan('Parola alanı', parola, { zorunlu: true, yardim: 'Parolanın yazıldığı kutu. Örnek: #parola ya da input[type="password"].' }),
      alan('Giriş düğmesi', gonder, { zorunlu: true, yardim: 'Girişi gönderen düğme. Örnek: button[type="submit"] ya da #giris.' }),
      h('div', { class: 'iki-sutun' },
        alan('Başarı göstergesi türü', basariTur, { yardim: 'Girişin başarılı olduğunu neyin gösterdiği; çoğu zaman “Sayfada görünen metin”.' }),
        alan('Başarı göstergesi', basariDeger, { zorunlu: true, yardim: 'Girişten sonra ekranda görünen yazı. Örnek: Oturumu Kapat.' })));
    const gelismisAcik = Boolean(t.baglamDegistirme) || (ikinci.tur && ikinci.tur !== 'yok') || !varsayilanMi(girisAdimlari) || hataSatirlari.length > 0
      || (Boolean(t.oturumKontrolAdresi) && t.oturumKontrolAdresi !== t.girisAdresi);
    const gelismisAyarlar = h('details', { class: 'tarif-adim-kutusu giris-gelismis', open: gelismisAcik },
      h('summary', {}, 'Gelişmiş ayarlar (isteğe bağlı)'),
      h('fieldset', {}, h('legend', {}, 'Oturum kontrolü'),
        alan('Oturum kontrol adresi (isteğe bağlı)', oturumAdresi, { yardim: oturumAdresiYardimi() }),
        oturumUyarisi),
      h('fieldset', { class: 'giris-adimlari-bolumu' }, h('legend', {}, 'Giriş adımları'),
        ozetKutusu,
        h('details', { class: 'tarif-adim-kutusu', open: !varsayilanMi(girisAdimlari) },
          h('summary', {}, girisAdimSayisi),
          h('p', { class: 'soluk kucuk' }, 'Kullanıcı adı, parola ve giriş düğmesinin önüne, arasına ya da arkasına adım ekleyin: ek alan (Doldur / Seçenek seç), onay kutusu ya da “Devam” (Tıkla), bekleme, başka bir sayfaya gitme. İki sayfalı girişte: Kullanıcı adı → “Devam”a tıkla → Parola → Giriş.'),
          ekAlanCipleri,
          girisDuzenleyici.liste, h('div', { class: 'dugmeler' }, girisAdimEkle))),
      h('fieldset', {}, h('legend', {}, 'Hata göstergeleri ve süre'),
        h('div', { class: 'alan' }, h('label', {}, 'Hata göstergeleri'),
          h('div', { class: 'yardim' }, 'Görünürse “kullanıcı adı veya parola hatalı” sayılır ve giriş beklemeden durur. Örnek: hata penceresindeki “Kullanıcı adı veya parola hatalı” yazısı.'),
          hataKutusu, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => hataEkle() }, ikon('arti'), 'Hata göstergesi ekle')),
        alan('Giriş bekleme süresi (sn)', zamanAsimi, { yardim: 'Giriş düğmesinden sonra başarı ya da hata göstergesi için beklenen süre (5–600). Örnek: 45.' })),
      h('fieldset', {}, h('legend', {}, 'İki aşamalı doğrulama'),
        h('div', { role: 'radiogroup', 'aria-label': 'İkinci adım türü' }, rYok.etiket, rTotp.etiket, rSms.etiket),
        totpNotu, smsNotu, kodAlanlari),
      h('fieldset', {}, h('legend', {}, 'Bağlam değiştirme (isteğe bağlı)'),
        h('label', { class: 'secenek', for: baglamVar.id }, baglamVar, 'Girişten sonra bağlam seç (rol, şube…)'),
        baglamAlani));
    const form = h('form', { class: 'kart form-paneli tarif-formu', novalidate: true, 'data-ortam': o.ortamId },
      h('h3', {}, `Giriş tarifi: ${o.ortamAd}`),
      h('p', { class: 'soluk kucuk' }, h('span', { class: 'mono' }, o.tabanUrl), ' — tarifte parola ya da kod yoktur; onlar giriş profilinde şifreli durur.'),
      on.not ? h('div', { class: 'not-kutusu uyari', role: 'status' }, on.not) : null,
      mesaj.kutu,
      zorunluBolum,
      akisBolumu,
      gelismisAyarlar,
      h('div', { class: 'dugmeler' }, kaydet, sifirla, h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    ikinciGorunum();
    baglamGorunum();    ikinciGorunum();
    baglamGorunum();
    adimOzetMetni.textContent = `Adımlar (${adimlar.length})`;
    form.addEventListener('input', () => { ozetiCiz(); oturumUyarisiniGuncelle(); });
    form.addEventListener('change', () => oturumUyarisiniGuncelle());
    ozetiCiz();
    oturumUyarisiniGuncelle();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      mesaj.temizle();
      [kullanici, parola, gonder, basariDeger].forEach((g) => alanHatasi(g, ''));
      const zorunlu = [[kullanici, 'Kullanıcı adı alanı boş olamaz.'], [parola, 'Parola alanı boş olamaz.'], [gonder, 'Giriş düğmesi boş olamaz.'], [basariDeger, 'Başarı göstergesi boş olamaz.']];
      for (const [g, m] of zorunlu) {
        if (!g.value.trim()) { alanHatasi(g, m); g.focus(); return; }
      }
      // Seçilen akışın istediği değerler yazılmalı (yoksa her girişte akış "değer yok" hatasıyla durur).
      for (const x of akisGirdileri) alanHatasi(x.girdi, '');
      const eksikDeger = akisGirdileri.find((x) => !String(x.girdi.value).trim());
      if (eksikDeger) { alanHatasi(eksikDeger.girdi, `${eksikDeger.etiket}: akış bu değeri istiyor.`); eksikDeger.girdi.focus(); return; }
      try {
        const { tarif } = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/giris-tarifi/kaydet', { govde: { projeId: proje.id, ortamId: o.ortamId, tarif: topla() } }));
        bildir('Giriş tarifi kaydedildi.');
        guncelle(tarif);
        formAlani.replaceChildren();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    if (sifirla) {
      sifirla.addEventListener('click', async () => {
        const tamam = await onayIste({ baslik: 'Kayıtlı tarif silinsin mi?', metin: `${o.ortamAd} ortamının giriş tarifi silinir; tarif yeniden tanımlanana kadar bu ortamda giriş yapılamaz.`, dugme: 'Tarifi sil', tehlikeli: true });
        if (!tamam) return;
        try {
          const { tarif } = await api('/platform/giris-tarifi/sifirla', { govde: { projeId: proje.id, ortamId: o.ortamId } });
          bildir('Kayıtlı tarif silindi.');
          guncelle(tarif);
          formAlani.replaceChildren();
        } catch (hata) { mesaj.goster(hata.message); }
      });
    }
    formAlani.replaceChildren(form);
    girisAdresi.focus();
    form.scrollIntoView({ block: 'nearest' });
  };

  // --- Girişi kaydet (görünür tarayıcıda kullanıcı girişi yapar; değer kaydedilmez) -------------
  const girisiKaydet = async (o) => {
    let adres = o.tarif ? o.tarif.girisAdresi : '/';
    try { adres = new URL(adres, o.tabanUrl).toString(); } catch { /* sunucu doğrular */ }
    const tamam = await onayIste({
      baslik: 'Giriş kaydedilsin mi?',
      metin: `Nöbetçi bu bilgisayarda görünür bir tarayıcıda ${adres} adresini GİRİŞ YAPMADAN açar. Girişi siz yaparsınız: bastığınız düğmeler siteye gerçek istek gönderir (dış siteye istek gider). Sayfadaki Nöbetçi paneli yalnızca alanları ve düğmeleri toplar; yazdığınız değerler (kullanıcı adı, parola, kod) kaydedilmez. Girişi bitirince paneldeki “Bitir”e basın.`,
      dugme: 'Tarayıcıyı aç', ikonAd: 'ag',
      liste: ['CANLI ortamda ayrıca "CANLI ortam" onayı sorulur.', 'Süre sınırı: Ayarlar > Koşu > akış kaydı süresi.']
    });
    if (!tamam) return;
    const kutu = h('div', { class: 'kart form-paneli giris-kaydi', 'data-ortam': o.ortamId, role: 'region', 'aria-label': `Giriş kaydı: ${o.ortamAd}` });
    formAlani.replaceChildren(kutu);
    const durumMetni = h('p', { role: 'status' }, 'Başlatılıyor…');
    const iptal = h('button', { type: 'button', class: 'hayalet' }, 'İptal');
    kutu.replaceChildren(h('h3', {}, `Giriş kaydı: ${o.ortamAd}`), durumMetni, h('div', { class: 'dugmeler' }, iptal));
    let isId = null;
    let bitti = false;
    iptal.addEventListener('click', async () => {
      bitti = true;
      if (isId) { try { await api('/platform/tarama/iptal', { govde: { id: isId } }); } catch { /* bitmiş olabilir */ } }
      formAlani.replaceChildren();
      bildir('Giriş kaydı iptal edildi.');
    });
    try {
      if (!(await canliOnayIste({ id: o.ortamId, ad: o.ortamAd, riskli: o.riskli, canli: o.canli }, 'Giriş kaydı'))) { formAlani.replaceChildren(); return; }
      const r = await api('/platform/tarama/baslat', { govde: { kip: 'girisKaydi', projeId: proje.id, ortamId: o.ortamId, onay: true, ...canliOnayEki(o.ortamId) } });
      isId = r.isId;
    } catch (hata) {
      kutu.replaceChildren(h('h3', {}, `Giriş kaydı: ${o.ortamAd}`), h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message),
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Kapat')));
      return;
    }
    // Durum yoklaması (1 sn).
    for (;;) {
      if (bitti || !kutu.isConnected) return;
      let d;
      try { d = (await api(`/platform/tarama/durum?id=${encodeURIComponent(isId)}`)).is; } catch (hata) { durumMetni.textContent = hata.message; return; }
      if (d.durum === 'suruyor') {
        const k = d.adimlar.find((a) => a.anahtar === 'kayit');
        durumMetni.textContent = k && k.mesaj ? k.mesaj : 'Tarayıcı açılıyor…';
        await new Promise((c) => setTimeout(c, 1000));
        continue;
      }
      if (d.durum !== 'tamam' || !d.girisTaslagi) {
        kutu.replaceChildren(h('h3', {}, `Giriş kaydı: ${o.ortamAd}`), h('div', { class: 'not-kutusu hata', role: 'alert' }, (d.hata && d.hata.mesaj) || 'Kayıt tamamlanmadı.'),
          h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Kapat')));
        return;
      }
      break;
    }
    const v = await api(`/platform/tarama/giris?id=${encodeURIComponent(isId)}`);
    taslakIsaretle(o, kutu, isId, v);
  };

  /**
   * Tarif kaydedildikten sonra: ortamın giriş profili yoksa kayıttan çıkan alanlarla oluşturulması önerilir. Kayıtta yazılan değerler
   * OKUNMADI (parola, kod, PIN saklanmaz); Nöbetçi yalnız hangi alanların gerektiğini bilir. Kullanıcı değerleri burada bir kez girer,
   * kasada şifreli saklanır; ayrıca Ayarlar'a gitmesi gerekmez. Profil zaten varsa yalnız eksik ek alanlar hatırlatılır.
   * @param {any} o ortam satırı @param {any} r kayıttan çıkan tarif sonucu @param {string | null} kod doğrulama kodunun kaynağı
   */
  const profilOnerisiSun = async (o, r, kod) => {
    let mevcut = null;
    try {
      const { profiller } = await api(`/platform/giris-profilleri?projeId=${encodeURIComponent(proje.id)}`);
      mevcut = (profiller || []).find((p) => !p.ortamId || p.ortamId === o.ortamId) || null;
    } catch { /* liste alınamadı: profil yine önerilir */ }
    const kutu = h('div', { class: 'kart form-paneli giris-kaydi', 'data-ortam': o.ortamId, role: 'region', 'aria-label': `Giriş kaydı: ${o.ortamAd}` });
    const kapat = () => formAlani.replaceChildren();
    const ustBolum = [h('h3', {}, `Giriş kaydı: ${o.ortamAd}`), h('div', { class: 'not-kutusu basari', role: 'status' }, `${o.ortamAd} girişi kaydedildi.`)];
    const profilDugmesi = () => h('button', { type: 'button', class: 'birincil', onclick: () => { kapat(); profiliAc(o.ortamAd); } }, ikon('kullanici'), 'Giriş profilini aç');
    if (mevcut) {
      const eksik = r.ekAlanlar.filter((e) => !(mevcut.ekAlanlar || []).some((x) => x.ad === e.ad));
      kutu.replaceChildren(...ustBolum,
        h('p', {}, `Bu ortamın giriş profili (“${mevcut.ad}”) zaten var; kayıtta yazdığınız değerler saklanmadığı için profildeki değerler kullanılır.`),
        eksik.length ? h('div', { class: 'not-kutusu uyari', role: 'status' }, h('p', {}, 'Profilde şu ek alanların değeri eksik:'), h('ul', {}, eksik.map((e) => h('li', {}, e.etiket, ' ', h('code', {}, `{${e.ad}}`), e.gizli ? ' (gizli)' : '')))) : null,
        h('div', { class: 'dugmeler' }, eksik.length ? profilDugmesi() : null, h('button', { type: 'button', class: 'hayalet', onclick: kapat }, 'Kapat')));
      formAlani.replaceChildren(kutu);
      return;
    }
    const girdi = (tur, ek = {}) => h('input', { type: tur, autocomplete: tur === 'password' ? 'new-password' : 'off', spellcheck: 'false', ...ek });
    const ad = girdi('text', { value: `${o.ortamAd} kullanıcısı` });
    const kullaniciAdi = girdi('text');
    const parolaGirdisi = girdi('password');
    const ekler = r.ekAlanlar.map((e) => ({ e, girdi: girdi(e.gizli ? 'password' : 'text') }));
    const totp = kod === 'totp' ? girdi('password') : null;
    const sabit = kod === 'sabit' ? girdi('text', { inputmode: 'numeric' }) : null;
    const mesaj = mesajKutusu();
    const olustur = h('button', { type: 'submit', class: 'birincil' }, ikon('onay'), 'Profili oluştur');
    const form = h('form', { novalidate: true, class: 'giris-profili-onerisi' },
      h('p', {}, h('strong', {}, 'Bu ortam için giriş profili oluşturulsun mu?')),
      h('p', { class: 'soluk kucuk' }, 'Kayıtta yazdığınız değerler (kullanıcı adı, parola, kod) saklanmadı; Nöbetçi yalnız hangi alanların gerektiğini kayıttan çıkardı. Değerleri burada bir kez girin: kasada şifreli saklanır, ayrıca ayar yapmanız gerekmez.'),
      mesaj.kutu,
      alan('Profil adı', ad, { zorunlu: true, yardim: 'Örnek: Test kullanıcısı.' }),
      alan('Kullanıcı adı', kullaniciAdi, { zorunlu: true, yardim: 'Girişte yazdığınız kullanıcı adı.' }),
      alan('Parola', parolaGirdisi, { zorunlu: true, yardim: 'Girişte yazdığınız parola; ekranda ve kayıtlarda düz görünmez.' }),
      ...ekler.map(({ e, girdi: g }) => alan(e.etiket, g, { zorunlu: true, yardim: `Giriş adımlarında {${e.ad}} olarak kullanılır${e.gizli ? '; gizli (maskeli, şifreli)' : ''}.` })),
      totp ? alan('Authenticator gizli anahtarı', totp, { zorunlu: true, yardim: 'İki aşamalı doğrulama kurulumunda “elle gir” bağlantısının gösterdiği metin.' }) : null,
      sabit ? alan('SMS sabit test kodu', sabit, { zorunlu: true, yardim: 'Test ortamında her seferinde geçerli olan kod.' }) : null,
      kod === 'elle' ? h('p', { class: 'soluk kucuk' }, 'SMS kodu koşu sırasında elle girilir; profilde kod saklanmaz.') : null,
      h('div', { class: 'dugmeler' }, olustur, h('button', { type: 'button', class: 'hayalet', onclick: kapat }, 'Şimdi değil')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      mesaj.temizle();
      const bos = [[ad, ad.value], [kullaniciAdi, kullaniciAdi.value], [parolaGirdisi, parolaGirdisi.value], ...ekler.map((x) => [x.girdi, x.girdi.value]),
        ...(totp ? [[totp, totp.value]] : []), ...(sabit ? [[sabit, sabit.value]] : [])].find(([, d]) => !String(d).trim());
      if (bos) { mesaj.goster('Bütün alanları doldurun.'); bos[0].focus(); return; }
      try {
        await mesgulIken(olustur, 'Oluşturuluyor…', () => api('/platform/giris-profili/kaydet', {
          govde: {
            projeId: proje.id, ortamId: o.ortamId, ad: ad.value.trim(), kullaniciAdi: kullaniciAdi.value.trim(), parola: parolaGirdisi.value,
            ikiAsamaliTur: kod === 'totp' ? 'totp' : kod ? 'sms' : 'yok',
            ...(totp ? { totpGizli: totp.value.trim() } : {}),
            ...(kod === 'sabit' ? { sms: { yontem: 'sabit', kod: sabit.value.trim() } } : kod === 'elle' ? { sms: { yontem: 'elle' } } : {}),
            ekAlanlar: ekler.map(({ e, girdi: g }) => ({ ad: e.ad, gizli: e.gizli, deger: g.value }))
          }
        }));
      } catch (hata) { mesaj.goster(hata.message); return; }
      for (const g of [parolaGirdisi, totp, ...ekler.map((x) => x.girdi)]) if (g) g.value = '';
      bildir('Giriş profili oluşturuldu.');
      kutu.replaceChildren(...ustBolum, h('div', { class: 'not-kutusu basari', role: 'status' }, `“${ad.value.trim()}” giriş profili oluşturuldu. Girişi “Girişi dene” ile deneyebilirsiniz.`),
        h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'birincil', onclick: kapat }, 'Kapat')));
    });
    kutu.replaceChildren(...ustBolum, form);
    formAlani.replaceChildren(kutu);
    kullaniciAdi.focus();
  };

  /** Kayıttan gelen adımlar: kullanıcı her birinin ne olduğunu işaretler → önizleme → tarif formu. */
  const taslakIsaretle = (o, kutu, isId, v) => {
    const ALAN_SECENEKLERI = [['kullaniciAdi', 'Kullanıcı adı'], ['parola', 'Parola'], ['kod', 'Doğrulama kodu (2FA)'], ['ek', 'Ek alan (değeri giriş profilinde)'], ['yoksay', 'Tarife alma']];
    const DUGME_SECENEKLERI = [['gonder', 'Giriş düğmesi'], ['tikla', 'Ara tıklama (ör. Devam, sekme, onay)'], ['kodGonder', 'Kodu gönder (2FA)'], ['yoksay', 'Tarife alma']];
    const SAYFA_SECENEKLERI = [['git', 'Bu sayfaya git'], ['yoksay', 'Tarife alma']];
    // Adres değişimi satırı taban adresle birlikte görünür (saklanan değer yine yoldur; ortamın taban adresine göre çözülür).
    const tamAdres = (/** @type {string} */ yol) => { try { return `${new URL(o.tabanUrl).origin}${yol}`; } catch { return yol; } };
    const satirlar = v.taslak.adimlar.map((a, i) => {
      const secim = h('select', { 'aria-label': `Kayıt adımı ${i + 1}: ne?` },
        (a.tur === 'alan' ? ALAN_SECENEKLERI : a.tur === 'sayfa' ? SAYFA_SECENEKLERI : DUGME_SECENEKLERI).map(([d, m]) => h('option', { value: d, selected: a.oneri === d }, m)));
      const adGirdi = monoGirdi(v.oneriler[i] || '', { 'aria-label': `Kayıt adımı ${i + 1}: ek alan adı`, placeholder: 'ör. firmaKodu' });
      const gizli = h('input', { type: 'checkbox', id: yeniKimlik('gizli') });
      const ekKutusu = h('div', { class: 'giris-kaydi-ek' }, h('label', { class: 'mini-alan' }, h('span', {}, 'Ek alan adı'), adGirdi),
        h('label', { class: 'secenek mini-secenek', for: gizli.id }, gizli, 'Gizli (PIN gibi; kasada şifreli, maskeli)'));
      const gorunum = () => { ekKutusu.hidden = !(a.tur === 'alan' && secim.value === 'ek' && !['checkbox', 'radio'].includes(a.alanTuru)); };
      secim.addEventListener('change', gorunum);
      gorunum();
      return {
        el: h('li', { class: 'giris-kaydi-adimi' },
          h('span', { class: 'tarif-adim-no sayi', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
          h('div', {}, h('strong', {}, a.tur === 'alan' ? `Alan: ${a.etiket}` : a.tur === 'sayfa' ? `Sayfa: ${tamAdres(a.yol)}` : `Düğme: ${a.metin || a.secici}`),
            h('div', { class: 'kucuk soluk' }, a.tur === 'alan' ? `tür: ${a.alanTuru}` : a.tur === 'sayfa' ? 'adres çubuğuyla gidildi' : 'basıldı')),
          secim, ekKutusu),
        isaret: () => ({ rol: secim.value, ad: adGirdi.value.trim(), gizli: gizli.checked })
      };
    });
    // --- Yalnız gerekenler: kodun kaynağı (kod alanı varsa), girişten sonra görünen yazı (kayıttan çıkarılamadıysa) ---
    const onceki = o.tarif && o.tarif.ikinciAdim && o.tarif.ikinciAdim.tur !== 'yok' ? o.tarif.ikinciAdim : null;
    const oncekiKaynak = onceki ? (onceki.tur === 'totp' ? 'totp' : onceki.smsKipi || 'sabit') : 'totp';
    const kodAd = yeniKimlik('kod');
    const kodRadyo = (deger, metin) => {
      const r = h('input', { type: 'radio', name: kodAd, value: deger, id: yeniKimlik('k'), checked: deger === oncekiKaynak });
      return h('label', { class: 'secenek', for: r.id }, r, metin);
    };
    const kodKutusu = h('fieldset', { class: 'giris-kaydi-soru' }, h('legend', {}, 'Girişte doğrulama kodu isteniyor. Kod nereden gelsin?'),
      h('div', { class: 'secenek-grubu', role: 'radiogroup', 'aria-label': 'Doğrulama kodunun kaynağı' },
        kodRadyo('totp', 'Authenticator uygulaması (kod, giriş profilindeki gizli anahtardan üretilir)'),
        kodRadyo('sabit', 'SMS: sabit test kodu (giriş profilinde kayıtlı)'),
        kodRadyo('elle', 'SMS: koşu sırasında kodu elle girerim')));
    const kodKaynagi = () => /** @type {HTMLInputElement | null} */ (kodKutusu.querySelector('input:checked'))?.value || 'totp';
    const kodVar = () => satirlar.some((s) => s.isaret().rol === 'kod');
    const basariGirdi = h('input', { type: 'text', autocomplete: 'off', placeholder: 'ör. Ana sayfa, Hoş geldiniz' });
    const basariKutusu = alan('Girişten sonra ekranda görünen bir yazı', basariGirdi, { yardim: 'Kayıtta çıkış bağlantısı ya da adres değişikliği görülmedi. Nöbetçi girişin başarılı olduğunu bu yazının görünmesinden anlar (tam eşleşme).' });
    basariKutusu.hidden = true;
    // --- Girişten sonra açılan sayfadan öneriler: yalnız kullanıcı işaretlerse tarife yazılır (mevcut değer kendiliğinden değişmez) ---
    const oturumOneriKutusu = h('input', { type: 'checkbox', id: yeniKimlik('oturum-onerisi') });
    const oturumOneriEtiketi = h('span', {});
    const basariOneriKutusu = h('input', { type: 'checkbox', id: yeniKimlik('basari-onerisi') });
    const basariOneriEtiketi = h('span', {});
    const oturumOneriSatiri = h('div', { hidden: true }, h('label', { class: 'secenek', for: oturumOneriKutusu.id }, oturumOneriKutusu, oturumOneriEtiketi));
    const basariOneriSatiri = h('div', { hidden: true }, h('label', { class: 'secenek', for: basariOneriKutusu.id }, basariOneriKutusu, basariOneriEtiketi));
    const sayfaOneriKutusu = h('fieldset', { class: 'giris-kaydi-soru', hidden: true },
      h('legend', {}, 'Girişten sonra açılan sayfadan öneriler'),
      h('p', { class: 'soluk kucuk' }, 'Oturum kontrol adresi: Nöbetçi her testten önce bu sayfayı açıp girişin hâlâ geçerli olup olmadığına bakar; giriş sayfası olursa her testte giriş beklenir.'),
      oturumOneriSatiri, basariOneriSatiri);
    /** Kullanıcının dokunduğu öneri kutuları (dokunulmadıysa sunucunun varsayılanı: yalnız yeni tarifte işaretli gelir). */
    const dokunulan = { oturum: false, basari: false };
    oturumOneriKutusu.addEventListener('change', () => { dokunulan.oturum = true; });
    basariOneriKutusu.addEventListener('change', () => { dokunulan.basari = true; });
    const onerileriCiz = (/** @type {any} */ so) => {
      const ot = so && so.oturumKontrolAdresi;
      const ba = so && so.basariGostergesi;
      oturumOneriSatiri.hidden = !ot;
      basariOneriSatiri.hidden = !ba;
      sayfaOneriKutusu.hidden = !ot && !ba;
      if (ot) {
        girisSonrasiSayfasiniHatirla(o.ortamId, ot.adres);
        oturumOneriEtiketi.textContent = `Oturum kontrol adresi olarak ${ot.adres} kullanılsın${ot.mevcut ? ` (şu an: ${ot.mevcut})` : ''}`;
        if (!dokunulan.oturum) oturumOneriKutusu.checked = Boolean(ot.kabul);
      }
      if (ba) {
        basariOneriEtiketi.textContent = `Başarı göstergesi olarak “${ba.gosterge.deger}” yazısı kullanılsın${ba.mevcut && ba.mevcut.deger ? ` (şu an: ${ba.mevcut.deger})` : ''}`;
        if (!dokunulan.basari) basariOneriKutusu.checked = Boolean(ba.kabul);
      }
    };
    const ozetAlani = h('div', { 'aria-live': 'polite' });
    const kaydet = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('onay'), 'Doğru, kaydet');
    const gelismis = h('button', { type: 'button', class: 'hayalet', disabled: true }, 'Ayrıntıları düzenle (gelişmiş)');
    let son = null;
    let sayac = 0;
    let zaman = null;
    const secimler = () => ({
      ...(kodVar() ? { kodKaynagi: kodKaynagi() } : {}),
      ...(!basariKutusu.hidden && basariGirdi.value.trim() ? { basariMetni: basariGirdi.value.trim() } : {}),
      ...(dokunulan.oturum ? { oturumOnerisi: oturumOneriKutusu.checked } : {}),
      ...(dokunulan.basari ? { basariOnerisi: basariOneriKutusu.checked } : {})
    });
    const basariMetni = (b) => (b.tur === 'metin' ? `ekranda “${b.deger}” yazısı görününce` : b.tur === 'url' ? `adres ${b.deger.replace(/\\/g, '')} olunca` : 'belirlenen öğe görününce');
    // Önizleme (kaydetmez): her değişiklikte sunucuda tarif yeniden üretilir; eski yanıtlar yok sayılır.
    const onizle = async () => {
      kodKutusu.hidden = !kodVar();
      const no = ++sayac;
      let r;
      try {
        r = await api('/platform/tarama/giris', { govde: { id: isId, isaretler: satirlar.map((s) => s.isaret()), secimler: secimler() } });
      } catch (hata) {
        if (no !== sayac) return;
        son = null;
        kaydet.disabled = gelismis.disabled = true;
        ozetAlani.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message));
        return;
      }
      if (no !== sayac) return;
      son = r;
      onerileriCiz(r.sayfaOnerileri);
      const b = r.tarif.basariGostergesi || { tur: 'metin', deger: '' };
      if (!b.deger && basariKutusu.hidden) basariKutusu.hidden = false;
      const eksikler = r.hatalar.length ? r.hatalar : r.dogrulamaHatalari;
      kaydet.disabled = eksikler.length > 0;
      gelismis.disabled = r.hatalar.length > 0;
      yerlestir(ozetAlani,
        b.deger ? h('div', { class: 'not-kutusu basari' }, `Giriş başarılı sayılacak: ${basariMetni(b)}.`) : null,
        eksikler.length ? h('div', { class: 'not-kutusu uyari', role: 'alert' }, h('p', {}, 'Kaydetmeden önce:'), h('ul', {}, eksikler.map((x) => h('li', {}, x)))) : null,
        r.ekAlanlar.length ? h('div', { class: 'not-kutusu bilgi' }, h('p', {}, 'Değerini giriş profilinde gireceğiniz ek bilgiler:'),
          h('ul', {}, r.ekAlanlar.map((e) => h('li', {}, e.etiket, ' ', h('code', {}, `{${e.ad}}`), e.gizli ? ' (gizli)' : '')))) : null,
        r.notlar.length ? h('div', { class: 'not-kutusu bilgi' }, h('ul', {}, r.notlar.map((x) => h('li', {}, x)))) : null);
    };
    const planla = () => { clearTimeout(zaman); zaman = setTimeout(onizle, 250); };
    kutu.addEventListener('change', () => planla());
    kutu.addEventListener('input', () => planla());

    gelismis.addEventListener('click', () => {
      if (!son) return;
      tarifFormu(o, {
        tarif: son.tarif, not: 'Bu tarif girişi kaydından hazırlandı ve henüz KAYDEDİLMEDİ: kontrol edip “Tarifi kaydet”e basın.',
        oturumOnerisi: son.sayfaOnerileri && son.sayfaOnerileri.oturumKontrolAdresi ? son.sayfaOnerileri.oturumKontrolAdresi.adres : null
      });
    });
    kaydet.addEventListener('click', async () => {
      if (!son) return;
      const r = son;
      let kayitli;
      try {
        ({ tarif: kayitli } = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/giris-tarifi/kaydet', { govde: { projeId: proje.id, ortamId: o.ortamId, tarif: r.tarif } })));
      } catch (hata) { ozetAlani.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); return; }
      bildir('Giriş tarifi kaydedildi.');
      guncelle(kayitli);
      // Sıradaki adım: giriş profili (değerler kasada şifreli; tarifte ve kayıtta değer yok).
      const kod = r.tarif.ikinciAdim && r.tarif.ikinciAdim.tur !== 'yok' ? kodKaynagi() : null;
      void profilOnerisiSun(o, r, kod);
    });
    kutu.replaceChildren(
      h('h3', {}, `Giriş kaydı: ${o.ortamAd}`),
      h('p', { class: 'soluk kucuk' }, 'Nöbetçi girişi böyle anladı: dokunduğunuz alanlar, bastığınız düğmeler ve gittiğiniz sayfalar sırasıyla listelendi (alan seçmeniz gerekmedi). Yanlış tanınan bir adım varsa yanındaki seçimi değiştirin. Kayıtta değer yok.'),
      // Adres değişimlerinin dökümü HER ZAMAN görünür: kaçı adım oldu, kaçı neden alınmadı; başka siteye gidildiyse uyarı.
      v.taslak.gezinmeOzetMetni ? gezinmeOzetiKutusu({ ozet: v.taslak.gezinmeOzeti, ozetMetni: v.taslak.gezinmeOzetMetni, uyarilar: v.taslak.gezinmeUyarilari || [] }, { id: o.ortamId }, proje.id) : null,
      h('ol', { class: 'giris-kaydi-listesi' }, satirlar.map((s) => s.el)),
      kodKutusu, basariKutusu, sayfaOneriKutusu, ozetAlani,
      h('div', { class: 'dugmeler' }, kaydet, gelismis, h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    kodKutusu.hidden = !kodVar();
    onizle();
    kutu.scrollIntoView({ block: 'nearest' });
  };

  ciz();
  kapsayici.replaceChildren(
    h('div', { class: 'bolum-basligi' }, h('h3', {}, 'Giriş tarifi', rozet(String(veri.ortamlar.length)))),
    h('p', { class: 'soluk kucuk bolum-aciklamasi' }, 'Testlerin bu ortamda nasıl giriş yapacağı. Önerilen: “Girişi kaydet” ile girişi tarayıcıda bir kez kendiniz yapın; Nöbetçi alanları, düğmeleri ve giriş sonrası sayfayı tanır, size yalnız onay ve gerekenler sorulur. “Elle tanımla” tüm ayrıntıları (seçiciler, göstergeler, bağlam) açar.'),
    formAlani,
    veri.ortamlar.length ? liste : bosDurum('Henüz ortam yok.', 'Önce Proje ve ortamlar bölümünden bir ortam ekleyin.', { ikon: 'ag', rol: 'status' }));

  // #/ayarlar/giris/tarif/<ortamId>: ilgili formu doğrudan aç.
  const eslesme = /^#\/ayarlar\/giris\/tarif\/([^/?#]+)/.exec(location.hash || '');
  if (eslesme) {
    const o = veri.ortamlar.find((x) => x.ortamId === decodeURIComponent(eslesme[1]));
    if (o) tarifFormu(o);
  }
}
