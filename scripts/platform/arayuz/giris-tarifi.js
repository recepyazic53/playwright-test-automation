// Ayarlar > Giriş profilleri > "Giriş tarifi" (genel): ortam başına giriş sayfasının tarifi — giriş adımları (kullanıcı
// adı / parola / giriş düğmesi ve aralarına eklenen doldur / seç / tıkla / bekle adımları), başarı/hata göstergeleri,
// iki aşamalı doğrulama adımı ve isteğe bağlı bağlam değiştirme adımları. Adımlar önce OKUNUR özetle gösterilir
// (giris-ozeti.mjs); teknik seçiciler "Gelişmiş" altındadır.
// Tarifte gizli değer yoktur (parola/anahtar/kod ve ek alan değerleri giriş profilindedir). "Varsayılanları öner" YALNIZCA
// kullanıcı açıkça isteyip onaylayınca ortamın giriş sayfasını sunucuda görünmez bir tarayıcıda açar
// (alan doldurmaz, göndermez). "Girişi kaydet" YALNIZCA kullanıcı onaylayınca görünür tarayıcıda giriş sayfasını açar;
// kullanıcı girişi kendisi yapar, yazılan değerler kaydedilmez. Ardından TEK onay ekranı: adımların rolü önerilmiş gelir,
// yalnız gerekenler sorulur (kod kaynağı; başarı yazısı kayıttan çıkmadıysa), tarif doğrudan kaydedilir (tüm ayrıntılar
// isteğe bağlı olarak formda). Kaydetme sunucuda doğrulanır (scripts/platform/giris/tarif.mjs).
// #/ayarlar/giris/tarif/<ortamId> ilgili ortamın tarif formunu doğrudan açar (giriş yalnız buradan yönetilir; Ekranlar'da listelenmez).
import { alan, alanHatasi, api, bildir, bosDurum, h, ikon, mesajKutusu, mesgulIken, oneriListesi, rozet, yeniKimlik, yerlestir } from './ortak.js';
import { canliOnayEki, canliOnayIste, onayIste } from './kosu-paneli.js';
import { girisAdimlariOzeti } from './giris-ozeti.mjs';
import { girisiDeneDugmesi } from './giris-denemesi.js';

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
  girisAdresi: '/', oturumKontrolAdresi: '/', kullaniciAlani: '', parolaAlani: '', gonderDugmesi: '',
  basariGostergesi: { tur: 'metin', deger: '' }, hataGostergeleri: [], ikinciAdim: { tur: 'yok' }, zamanAsimiSn: 45, baglamDegistirme: null
});

const monoGirdi = (deger, ek = {}) => h('input', { type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', value: deger ?? '', ...ek });

/** Tarifin tek satırlık teknik özeti. */
function ozet(t) {
  if (!t) return 'Bu ortamda giriş yapılamaz; tarif tanımlayın.';
  const parca = [`Giriş: ${t.girisAdresi}`, `2FA: ${IKINCI_ADIM_ETIKETI[t.ikinciAdim.tur] || t.ikinciAdim.tur}`];
  parca.push(t.baglamDegistirme ? `Bağlam: ${t.baglamDegistirme.baglamTuru} (${t.baglamDegistirme.adimlar.length} adım)` : 'Bağlam değiştirme yok');
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
    return kalan;
  });
}

const varsayilanMi = (adimlar) => adimlar.length === 3 && adimlar.every((a, i) => Object.keys(a).length === 1 && a.islem === VARSAYILAN_GIRIS_ADIMLARI[i].islem);

/**
 * Sıralı adım düzenleyici (bağlam adımları ve giriş adımları ortak).
 * @param {{ adimlar: any[]; islemler: Array<{ islem: string; etiket: string }>; onEk: string; ogeSinifi: string; degerYardimi: string; degisti?: () => void }} s
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
      case 'git': govde.append(girdi('Adres', 'adres', '/yol ya da tam adres')); break;
      case 'adresBekle': govde.append(girdi('Adres deseni', 'desen', 'Düzenli ifade')); break;
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
  const girisIslemleri = veri.girisAdimIslemleri || [
    { islem: 'kullaniciAdi', etiket: 'Kullanıcı adını yaz' }, { islem: 'parola', etiket: 'Parolayı yaz' }, { islem: 'gonder', etiket: 'Giriş düğmesine bas' },
    ...veri.adimIslemleri
  ];
  const formAlani = h('div', {});
  const liste = h('ul', { class: 'kayit-listesi' });
  const ciz = () => {
    liste.replaceChildren(...veri.ortamlar.map((o) => {
      const [rozetMetni, rozetTuru] = KAYNAK_ROZETI[o.kaynak] || KAYNAK_ROZETI.yok;
      return h('li', { 'data-ortam': o.ortamId },
        h('span', { class: 'kayit-ikon', 'aria-hidden': 'true' }, ikon('anahtar')),
        h('div', { class: 'kayit-ana' }, h('strong', {}, o.ortamAd, ' ', rozet(rozetMetni, rozetTuru)),
          h('div', { class: 'kayit-meta' }, ozet(o.tarif)),
          o.tarif ? h('div', { class: 'kayit-meta giris-ozet-satiri' }, girisAdimlariOzeti(o.tarif).map((x, i) => `${i + 1}. ${x.metin}`).join(' · ')) : null,
          o.hatalar && o.hatalar.length ? h('div', { class: 'kayit-meta hata-metni' }, `Tarif geçersiz: ${o.hatalar.join(' ')}`) : null),
        h('div', { class: 'kayit-eylemleri' },
          // Önerilen yol "Girişi kaydet" (tarif yoksa birincil); elle tanımlama gelişmiş seçenek olarak yanında durur.
          h('button', { type: 'button', class: o.tarif ? 'kucuk-dugme hayalet' : 'kucuk-dugme birincil', 'aria-label': `${o.ortamAd}: girişi kaydet`, onclick: () => girisiKaydet(o) },
            ikon('oynat'), o.tarif ? 'Yeniden kaydet' : 'Girişi kaydet'),
          o.tarif ? girisiDeneDugmesi(o, proje.id) : null,
          (o.tarif ? h('button', { type: 'button', class: 'kucuk-dugme', 'aria-label': `${o.ortamAd}: giriş tarifini düzenle`, onclick: () => tarifFormu(o) }, ikon('duzenle'), 'Düzenle')
            : h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${o.ortamAd}: giriş tarifi ekle`, onclick: () => tarifFormu(o) }, 'Elle tanımla'))));
    }));
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

  /** @param {any} o ortam satırı @param {{ tarif?: any; not?: string }} [on] kayıttan gelen öneri (kaydedilmemiş) */
  const tarifFormu = (o, on = {}) => {
    const t = JSON.parse(JSON.stringify(on.tarif || o.tarif || bosTarif()));
    const mesaj = mesajKutusu();
    const girisAdresi = monoGirdi(t.girisAdresi);
    const oturumAdresi = monoGirdi(t.oturumKontrolAdresi);
    const kullanici = monoGirdi(t.kullaniciAlani);
    const parola = monoGirdi(t.parolaAlani);
    const gonder = monoGirdi(t.gonderDugmesi);

    // --- Varsayılanları öner (yalnızca açık istek + onay) ---------------------------------
    const oneriNotu = h('div', { role: 'status' });
    const oner = h('button', { type: 'button', class: 'kucuk-dugme' }, ikon('simsek'), 'Varsayılanları öner');
    oner.addEventListener('click', async () => {
      const yol = girisAdresi.value.trim() || '/';
      let adres = yol;
      try { adres = new URL(yol, o.tabanUrl).toString(); } catch { /* sunucu doğrular */ }
      const tamam = await onayIste({
        baslik: 'Giriş sayfası açılsın mı?',
        metin: `Nöbetçi, ${adres} adresini bu bilgisayarda görünmez bir tarayıcıda açıp sayfadaki giriş formunu inceleyecek. Hiçbir alan doldurulmaz, hiçbir şey gönderilmez; yine de sitenin sunucusuna bir sayfa isteği gider.`,
        dugme: 'Sayfayı aç ve öner', ikonAd: 'ag'
      });
      if (!tamam) return;
      if (!(await canliOnayIste({ id: o.ortamId, ad: o.ortamAd, riskli: o.riskli, canli: o.canli }, 'Giriş sayfası önerisi'))) return;
      oneriNotu.replaceChildren();
      try {
        const { oneri } = await mesgulIken(oner, 'Sayfa inceleniyor…', () => api('/platform/giris-tarifi/oner', {
          govde: { projeId: proje.id, ortamId: o.ortamId, girisAdresi: girisAdresi.value.trim(), onay: true, ...canliOnayEki(o.ortamId) }
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
          h('p', {}, 'Öneriler alanlara yazıldı; kaydetmeden önce kontrol edin. Başarı göstergesini (giriş sonrası görünen metin/öğe) siz belirleyin.'),
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
      degerYardimi: '{ad} = giriş profilinin ek alanı (ör. {firmaKodu})', degisti: () => ozetiCiz()
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
        h('p', {}, 'Kod aşağıdaki süre içinde girilmezse giriş “Doğrulama kodu alınamadı” hatasıyla durur. Gözetimsiz (zamanlanmış) koşular için sabit test kodu tanımlayın.')),
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
      h('p', {}, h('strong', {}, 'SMS kodunun kaynağı giriş profilinde tanımlanır: '), 'Ayarlar > Giriş profilleri > profil > "İki aşamalı doğrulama: SMS" (sabit test kodu ya da koşu sırasında elle girilir). Aşağıdaki seçim bu ortam için profildeki ayarı geçersiz kılabilir. ',
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
      adimlar, islemler: veri.adimIslemleri, onEk: 'Adım', ogeSinifi: 'tarif-adim', degerYardimi: '{alan} yer tutucusu kullanılabilir',
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

    // --- Toplama + kaydetme ---------------------------------------------------------------
    const topla = () => {
      const tur = rTotp.r.checked ? 'totp' : rSms.r.checked ? 'sms' : 'yok';
      const giris = adimlariTemizle(girisAdimlari);
      const sonuc = {
        girisAdresi: girisAdresi.value.trim() || '/',
        oturumKontrolAdresi: oturumAdresi.value.trim(),
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
    // Seçiciler "Gelişmiş" altında; boşsa (yeni tarif) açık gelir.
    const gelismis = h('details', { class: 'tarif-adim-kutusu giris-gelismis', open: !t.kullaniciAlani || !t.parolaAlani || !t.gonderDugmesi },
      h('summary', {}, 'Gelişmiş: giriş formunun seçicileri'),
      alan('Kullanıcı adı alanı', kullanici, { zorunlu: true, yardim: SECICI_YARDIMI }),
      alan('Parola alanı', parola, { zorunlu: true }),
      alan('Giriş düğmesi', gonder, { zorunlu: true, yardim: 'Form düğmesi, input[type=submit] ya da görüntü düğmesi (input[type=image]).' }));
    const form = h('form', { class: 'kart form-paneli tarif-formu', novalidate: true, 'data-ortam': o.ortamId },
      h('h3', {}, `Giriş tarifi: ${o.ortamAd}`),
      h('p', { class: 'soluk kucuk' }, h('span', { class: 'mono' }, o.tabanUrl), ' — tarifte parola ya da kod yoktur; onlar giriş profilinde şifreli durur.'),
      on.not ? h('div', { class: 'not-kutusu uyari', role: 'status' }, on.not) : null,
      mesaj.kutu,
      h('fieldset', {}, h('legend', {}, 'Giriş sayfası'),
        h('div', { class: 'iki-sutun' },
          alan('Giriş adresi', girisAdresi, { yardim: 'Taban adrese göre yol (ör. / ya da /giris) veya tam http(s) adresi.' }),
          alan('Oturum kontrol adresi', oturumAdresi, { yardim: 'Kayıtlı oturumun geçerliliğine bakılan sayfa (boşsa giriş adresi).' })),
        h('div', { class: 'oneri-satiri' }, oner,
          h('span', { class: 'soluk kucuk' }, ikon('uyari'), ' Ortamın adresini bu bilgisayarda açar; yalnızca siz basınca çalışır.')),
        oneriNotu,
        gelismis),
      h('fieldset', { class: 'giris-adimlari-bolumu' }, h('legend', {}, 'Giriş adımları'),
        ozetKutusu,
        h('details', { class: 'tarif-adim-kutusu', open: !varsayilanMi(girisAdimlari) },
          h('summary', {}, girisAdimSayisi),
          h('p', { class: 'soluk kucuk' }, 'Kullanıcı adı, parola ve giriş düğmesinin önüne, arasına ya da arkasına adım ekleyin: ek alan (Doldur / Seçenek seç), onay kutusu ya da “Devam” (Tıkla), bekleme. İki sayfalı girişte: Kullanıcı adı → “Devam”a tıkla → Parola → Giriş.'),
          ekAlanCipleri,
          girisDuzenleyici.liste, h('div', { class: 'dugmeler' }, girisAdimEkle))),
      h('fieldset', {}, h('legend', {}, 'Sonuç göstergeleri'),
        h('div', { class: 'iki-sutun' }, alan('Başarı göstergesi türü', basariTur), alan('Başarı göstergesi', basariDeger, { zorunlu: true, yardim: 'Girişten sonra görünen metin (ör. "Oturumu Kapat"), adres deseni ya da öğe.' })),
        h('div', { class: 'alan' }, h('label', {}, 'Hata göstergeleri'),
          h('div', { class: 'yardim' }, 'Görünürse “kullanıcı adı veya parola hatalı” sayılır ve giriş beklemeden durur (ör. hata penceresindeki metin).'),
          hataKutusu, h('button', { type: 'button', class: 'kucuk-dugme', onclick: () => hataEkle() }, ikon('arti'), 'Hata göstergesi ekle')),
        alan('Giriş bekleme süresi (sn)', zamanAsimi, { yardim: 'Giriş düğmesinden sonra başarı/hata göstergesi için beklenen süre (5–600).' })),
      h('fieldset', {}, h('legend', {}, 'İki aşamalı doğrulama'),
        h('div', { role: 'radiogroup', 'aria-label': 'İkinci adım türü' }, rYok.etiket, rTotp.etiket, rSms.etiket),
        totpNotu, smsNotu, kodAlanlari),
      h('fieldset', {}, h('legend', {}, 'Bağlam değiştirme (isteğe bağlı)'),
        h('label', { class: 'secenek', for: baglamVar.id }, baglamVar, 'Girişten sonra bağlam seç (rol, şube…)'),
        baglamAlani),
      h('div', { class: 'dugmeler' }, kaydet, sifirla, h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Vazgeç')));
    ikinciGorunum();
    baglamGorunum();
    adimOzetMetni.textContent = `Adımlar (${adimlar.length})`;
    form.addEventListener('input', () => ozetiCiz());
    ozetiCiz();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      mesaj.temizle();
      [kullanici, parola, gonder, basariDeger].forEach((g) => alanHatasi(g, ''));
      const zorunlu = [[kullanici, 'Kullanıcı adı alanı boş olamaz.'], [parola, 'Parola alanı boş olamaz.'], [gonder, 'Giriş düğmesi boş olamaz.'], [basariDeger, 'Başarı göstergesi boş olamaz.']];
      for (const [g, m] of zorunlu) {
        if (!g.value.trim()) { if (gelismis.contains(g)) gelismis.open = true; alanHatasi(g, m); g.focus(); return; }
      }
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

  /** Kayıttan gelen adımlar: kullanıcı her birinin ne olduğunu işaretler → önizleme → tarif formu. */
  const taslakIsaretle = (o, kutu, isId, v) => {
    const ALAN_SECENEKLERI = [['kullaniciAdi', 'Kullanıcı adı'], ['parola', 'Parola'], ['kod', 'Doğrulama kodu (2FA)'], ['ek', 'Ek alan (değeri giriş profilinde)'], ['yoksay', 'Tarife alma']];
    const DUGME_SECENEKLERI = [['gonder', 'Giriş düğmesi'], ['tikla', 'Ara tıklama (ör. Devam, sekme, onay)'], ['kodGonder', 'Kodu gönder (2FA)'], ['yoksay', 'Tarife alma']];
    const satirlar = v.taslak.adimlar.map((a, i) => {
      const secim = h('select', { 'aria-label': `Kayıt adımı ${i + 1}: ne?` },
        (a.tur === 'alan' ? ALAN_SECENEKLERI : DUGME_SECENEKLERI).map(([d, m]) => h('option', { value: d, selected: a.oneri === d }, m)));
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
          h('div', {}, h('strong', {}, a.tur === 'alan' ? `Alan: ${a.etiket}` : `Düğme: ${a.metin || a.secici}`),
            h('div', { class: 'kucuk soluk' }, a.tur === 'alan' ? `tür: ${a.alanTuru}` : 'basıldı')),
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
    const ozetAlani = h('div', { 'aria-live': 'polite' });
    const kaydet = h('button', { type: 'button', class: 'birincil', disabled: true }, ikon('onay'), 'Doğru, kaydet');
    const gelismis = h('button', { type: 'button', class: 'hayalet', disabled: true }, 'Ayrıntıları düzenle (gelişmiş)');
    let son = null;
    let sayac = 0;
    let zaman = null;
    const secimler = () => ({
      ...(kodVar() ? { kodKaynagi: kodKaynagi() } : {}),
      ...(!basariKutusu.hidden && basariGirdi.value.trim() ? { basariMetni: basariGirdi.value.trim() } : {})
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
      const b = r.tarif.basariGostergesi || { tur: 'metin', deger: '' };
      if (!b.deger && basariKutusu.hidden) basariKutusu.hidden = false;
      const eksikler = r.hatalar.length ? r.hatalar : r.dogrulamaHatalari;
      kaydet.disabled = eksikler.length > 0;
      gelismis.disabled = r.hatalar.length > 0;
      yerlestir(ozetAlani,
        b.deger ? h('div', { class: 'not-kutusu basari' }, ikon('onay'), ` Giriş başarılı sayılacak: ${basariMetni(b)}.`) : null,
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
      tarifFormu(o, { tarif: son.tarif, not: 'Bu tarif girişi kaydından hazırlandı ve henüz KAYDEDİLMEDİ: kontrol edip “Tarifi kaydet”e basın.' });
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
      // Sıradaki adım: giriş profilinde olması gerekenler (değerler kasada; tarifte değer yok).
      const kod = r.tarif.ikinciAdim && r.tarif.ikinciAdim.tur !== 'yok' ? kodKaynagi() : null;
      const gerekenler = ['Kullanıcı adı ve parola', ...r.ekAlanlar.map((e) => `${e.etiket} (ek alan adı: ${e.ad}${e.gizli ? ', gizli' : ''})`),
        ...(kod === 'totp' ? ['Authenticator gizli anahtarı'] : kod === 'sabit' ? ['SMS sabit test kodu'] : [])];
      formAlani.replaceChildren(h('div', { class: 'kart form-paneli giris-kaydi', 'data-ortam': o.ortamId, role: 'region', 'aria-label': `Giriş kaydı: ${o.ortamAd}` },
        h('h3', {}, `Giriş kaydı: ${o.ortamAd}`),
        h('div', { class: 'not-kutusu basari', role: 'status' }, ikon('onay'), ` ${o.ortamAd} girişi kaydedildi.`),
        h('p', {}, 'Sıradaki adım: bu ortamın giriş profilinde şunlar olmalı:'),
        h('ul', {}, gerekenler.map((x) => h('li', {}, x))),
        h('div', { class: 'dugmeler' },
          h('button', { type: 'button', class: 'birincil', onclick: () => { formAlani.replaceChildren(); profiliAc(o.ortamAd); } }, ikon('kullanici'), 'Giriş profilini aç'),
          h('button', { type: 'button', class: 'hayalet', onclick: () => formAlani.replaceChildren() }, 'Kapat'))));
    });
    kutu.replaceChildren(
      h('h3', {}, `Giriş kaydı: ${o.ortamAd}`),
      h('p', { class: 'soluk kucuk' }, 'Nöbetçi girişi böyle anladı. Yanlış tanınan bir adım varsa yanındaki seçimi değiştirin. Kayıtta değer yok; yalnızca dokunduğunuz alanlar ve bastığınız düğmeler var.'),
      h('ol', { class: 'giris-kaydi-listesi' }, satirlar.map((s) => s.el)),
      kodKutusu, basariKutusu, ozetAlani,
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
