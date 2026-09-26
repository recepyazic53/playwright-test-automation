// GALAKSİ — KODLU SENARYOLARI AKIŞA TAŞIMA: JetSağlık ve JetKOBİ taşıyıcıları (bkz. akis-tasima.mjs; aynı Tasiyici tipi).
// Kodlu testin senaryo matrisi ürün verisinden (yenidenKur > dosyalar) akış ekranının senaryo anahtarlarına çevrilir;
// kimlikler PROFİL ADIYLA yazılır, başlıklar kodlu testlerinkiyle birebir aynıdır.
// NOT: import.meta KULLANILMAZ.

/** @typedef {import('../index.d.mts').YenidenKurulanVeri} YenidenKurulanVeri */
/** @typedef {import('../index.d.mts').AkisSenaryoTaslagi} AkisSenaryoTaslagi */
/** @typedef {Record<string, any>} Nesne */
/** @typedef {(v: YenidenKurulanVeri) => { kaynakEkran: string; taslaklar: AkisSenaryoTaslagi[]; notlar: string[] }} Tasiyici */

const nesneMi = (/** @type {unknown} */ d) => typeof d === 'object' && d !== null && !Array.isArray(d);
const nesne = (/** @type {unknown} */ d) => (nesneMi(d) ? /** @type {Nesne} */ (d) : /** @type {Nesne} */ ({}));
const metinDegeri = (/** @type {unknown} */ d) => (d === undefined || d === null ? '' : String(d));
/** Seçim verisi ({ deger, metin }) → sayfadaki "value". */
const deger = (/** @type {unknown} */ s) => (nesneMi(s) ? metinDegeri(/** @type {Nesne} */ (s).deger) : metinDegeri(s));
/** Seçim verisi → görünen metin (jqTransform listeleri metinle seçilir). */
const gorunenMetin = (/** @type {unknown} */ s) => (nesneMi(s) ? metinDegeri(/** @type {Nesne} */ (s).metin) : metinDegeri(s));
function urunVerisi(/** @type {YenidenKurulanVeri} */ v, /** @type {string} */ dosya, /** @type {string} */ kok) {
  const u = nesne(v.dosyalar[dosya])[kok];
  if (!nesneMi(u)) throw new Error(`"${dosya}" ürün verisi bu ortamda yok (kodlu testin verisi aktarılmamış).`);
  return /** @type {Nesne} */ (u);
}
/** @param {Nesne} u */
function odemeSonucuNotu(u) {
  const l = Array.isArray(u.kabulEdilenOdemeSonuclari) ? u.kabulEdilenOdemeSonuclari.filter((/** @type {unknown} */ x) => typeof x === 'string' && x) : [];
  return l.length ? [`Kodlu testin kabul ettiği ödeme sonuçları: ${l.map((/** @type {string} */ x) => `“${x}”`).join(', ')}. Ödeme ortak akışının başarı mesajları arasında yoksa ödeme adımı bu sonuçla düşer.`] : [];
}

/**
 * JetSağlık: sigortalı (yabancı kimlik / pasaport) × sigorta ettiren (kendisi / farklı özel / farklı tüzel / pasaport); hepsi öder
 * (tests/scenarios/jet-saglik/yeni-is-matrisi.spec.ts).
 * @type {Tasiyici}
 */
export function jetSaglikTasiyici(v) {
  const u = urunVerisi(v, 'jet-saglik', 'jetSaglik');
  const p = nesne(u.profiller);
  const sigortalilar = /** @type {const} */ ([['yabanciKimlik', 'Yabancı Kimlik', 'sigortaliYabanciKimlik'], ['pasaport', 'Pasaport', 'sigortaliPasaport']]);
  const ettirenler = /** @type {const} */ ([['kendisi', 'Kendisi', ''], ['ozel', 'Farklı Özel', 'farkliOzel'], ['tuzel', 'Farklı Tüzel', 'farkliTuzel'], ['pasaport', 'Pasaport', 'farkliPasaport']]);
  const ortak = {
    policeSuresi: deger(u.policeSuresi), hastalik: deger(u.hastalik), kvkkOnayi: deger(u.kvkkOnayi), yenileme: deger(u.yenileme),
    indirimOrani: metinDegeri(u.indirimOrani), odemeAdimiDahil: true
  };
  /** @type {AkisSenaryoTaslagi[]} */
  const taslaklar = [];
  for (const [sTip, sMetin, sProfil] of sigortalilar) {
    for (const [eTip, eMetin, eProfil] of ettirenler) {
      /** @type {Nesne} */
      const veri = { sigortaliTipi: sTip, sigortaliProfili: metinDegeri(p[sProfil]) };
      if (sTip === 'pasaport') veri.sigortaliAdresProfili = metinDegeri(p.sigortaliPasaportAdresi);
      if (eTip === 'kendisi') veri.farkliMusteri = 'kendisi';
      else Object.assign(veri, { farkliMusteri: 'farkli', musteriTipi: eTip, ettirenProfili: metinDegeri(p[eProfil]) });
      taslaklar.push({ baslik: `Sigortalı ${sMetin} / Sigorta Ettiren ${eMetin} / Yeni İş Testi`, veri: { ...veri, ...ortak } });
    }
  }
  const notlar = [
    'Kodlu testteki gibi her senaryoda ödeme dahil ("Ödeme (doğrudan kart formu)" ortak akışı; yalnızca test ortamında koşar).',
    'Yabancı kimlikli sigortalıda kodlu test (POM) eksik adres seçimlerini koşullu tamamlıyordu (belde "-1" ise ilk geçerli seçenek, boş mahalle / cadde için "Test Mahallesi" / "Test Caddesi"); akış bunu yapamadığı için "eksikBelde / eksikMahalle / eksikCadde" boş bırakıldı — adres sorgudan eksik gelirse adım düşebilir.',
    '"Yenileme" (#Yenileme) gizli liste: kodlu test gibi betikle seçilir (degerJs).',
    'Farklı pasaportlu sigorta ettirende telefon satırı gizli: kodlu test gibi betikle yazılır (degerJs).',
    'Kodlu test ödeme sonucunu "/jet-satis/jet-saglik/policelestir" servis cevabında da arıyordu; ortak akış yalnızca sayfa metnini okur.'
  ];
  if (!/^\d+$/.test(ortak.indirimOrani.trim())) {
    notlar.push(`İndirim oranı "${ortak.indirimOrani}" sayı değil; ekran bu değeri kabul etmeyebilir.`);
  }
  if (u.aktif === false) notlar.push('Ürün verisinde "aktif: false": kodlu testler bu ortamda atlanıyordu.');
  notlar.push(...odemeSonucuNotu(u));
  return { kaynakEkran: 'JetSağlık', taslaklar, notlar };
}

/**
 * JetKOBİ: sigortalı (özel / tüzel) × sigorta ettiren (aynı / farklı özel / farklı tüzel) × sigortalı durumu (mal sahibi / kiracı);
 * hepsi öder (tests/scenarios/jet-kobi/teklif-matrisi.spec.ts).
 * @type {Tasiyici}
 */
export function jetKobiTasiyici(v) {
  const u = urunVerisi(v, 'jet-kobi', 'jetKobi');
  const p = nesne(u.profiller);
  const kimlikler = nesne(nesne(v.ortak).kimlikBilgileri);
  const eksikTelefon = new Set();
  /** Telefon iki alanda (POM telefonGir: ilk 3 hane + kalanı); profildeki cepTelefonu bölünür. */
  const telefon = (/** @type {'ozel' | 'tuzel'} */ tur, /** @type {string} */ profil) => {
    const t = metinDegeri(nesne(nesne(kimlikler[tur])[profil]).cepTelefonu);
    if (!t) eksikTelefon.add(`${tur}/${profil}`);
    return { kod: t.slice(0, 3), no: t.slice(3) };
  };
  const tipMetni = (/** @type {string} */ t) => (t === 'ozel' ? 'Özel' : 'Tüzel');
  const tm = nesne(u.teminatlar);
  const ortak = {
    adresKodu: metinDegeri(u.adresKodu), dainiMurtehin: metinDegeri(u.dainiMurtehin), isciSayisi: metinDegeri(u.isciSayisi),
    isverenMaliMesuliyeti: gorunenMetin(u.isverenMaliMesuliyeti), ucuncuSahisMaliMesuliyeti: gorunenMetin(u.ucuncuSahisMaliMesuliyeti),
    yapiTarzi: gorunenMetin(u.yapiTarzi), istigalTipi: gorunenMetin(u.istigalTipi), istigalCinsi: gorunenMetin(u.istigalCinsi),
    toplamKat: gorunenMetin(u.toplamKat), rizikonunBulunduguKat: gorunenMetin(u.rizikonunBulunduguKat), catiTipi: gorunenMetin(u.catiTipi),
    binaInsaYili: metinDegeri(u.binaInsaYili), ferdiKazaTeminati: gorunenMetin(u.ferdiKazaTeminati),
    binaYangin: metinDegeri(tm.binaYangin), sigortaliyaAitEmtea: metinDegeri(tm.sigortaliyaAitEmtea), ucuncuSahsaAitEmtea: metinDegeri(tm.ucuncuSahsaAitEmtea),
    demirbas: metinDegeri(tm.demirbas), makine: metinDegeri(tm.makine), kasa: metinDegeri(tm.kasa), dahiliDekorasyon: metinDegeri(tm.dahiliDekorasyon),
    urunSorumluluk: metinDegeri(tm.urunSorumluluk), isDurmasi: metinDegeri(tm.isDurmasi), dekorasyonHirsizlik: metinDegeri(tm.dekorasyonHirsizlik),
    camKirilmasi: metinDegeri(tm.camKirilmasi), yanginVeGuvenlikOnlemleri: metinDegeri(tm.yanginVeGuvenlikOnlemleri), odemeAdimiDahil: true
  };
  /** @type {AkisSenaryoTaslagi[]} */
  const taslaklar = [];
  for (const sTip of /** @type {const} */ (['ozel', 'tuzel'])) {
    for (const eTip of /** @type {const} */ (['ayni', 'ozel', 'tuzel'])) {
      for (const durum of /** @type {const} */ (['malSahibi', 'kiraci'])) {
        const sProfil = metinDegeri(p[sTip === 'ozel' ? 'sigortaliOzel' : 'sigortaliTuzel']);
        const st = telefon(sTip, sProfil);
        /** @type {Nesne} */
        const veri = { sigortaliTipi: sTip, sigortaliProfili: sProfil, sigortaliTelefonKodu: st.kod, sigortaliTelefonNo: st.no };
        if (eTip === 'ayni') veri.sigortaEttiren = 'ayni';
        else {
          const eProfil = metinDegeri(p[eTip === 'ozel' ? 'farkliOzel' : 'farkliTuzel']);
          const et = telefon(eTip, eProfil);
          Object.assign(veri, { sigortaEttiren: 'farkli', sigortaEttirenTipi: eTip, sigortaEttirenProfili: eProfil, sigortaEttirenTelefonKodu: et.kod, sigortaEttirenTelefonNo: et.no });
        }
        veri.sigortaliDurumu = durum;
        if (durum === 'malSahibi') Object.assign(veri, { binaTipi: gorunenMetin(u.binaTipi), brutYuzolcum: metinDegeri(u.brutYuzolcum), daskaBagli: metinDegeri(u.daskaBagli) });
        const ettiren = eTip === 'ayni' ? 'Aynı' : `Farklı ${tipMetni(eTip)}`;
        taslaklar.push({
          baslik: `Sigortalı ${tipMetni(sTip)} / Sigorta Ettiren ${ettiren} / Sigortalı Durumu ${durum === 'malSahibi' ? 'Mal Sahibi' : 'Kiracı'} Testi`,
          veri: { ...veri, ...ortak }
        });
      }
    }
  }
  const notlar = [
    'Kodlu testteki gibi her senaryoda ödeme dahil ("Ödeme (teklif kaydet + kredi kartı)" ortak akışı; yalnızca test ortamında koşar).',
    'Açılır listeler (bina tipi, mali mesuliyetler, yapı tarzı, iştigal tipi / cinsi, kat, çatı, ferdi kaza) akışta jqTransform ile GÖRÜNEN METİNLE seçilir: senaryoya ürün verisindeki "metin" yazıldı (kodlu test gizli <select>\'e "deger" yazıyordu). Metin ekrandakinden farklıysa adım düşer.',
    'Telefon, kimlik profilindeki cep telefonundan bölünerek (ilk 3 hane + kalanı) senaryoya yazıldı; profil telefonu değişirse senaryo eski değerde kalır.',
    'Kiracı senaryolarında bina tipi / brüt yüzölçümü / DASK\'a bağlı yazılmadı (kodlu testte de yalnızca mal sahibinde girilir).'
  ];
  if (eksikTelefon.size) notlar.push(`Cep telefonu profilde yok: ${[...eksikTelefon].join(', ')} — telefon alanları boş kaldı.`);
  if (u.aktif === false) notlar.push('Ürün verisinde "aktif: false": kodlu testler bu ortamda atlanıyordu.');
  notlar.push(...odemeSonucuNotu(u));
  return { kaynakEkran: 'JetKOBİ', taslaklar, notlar };
}
