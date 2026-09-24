// GALAKSİ GİRİŞ TARİFİ — PROJEYE ÖZGÜ. Eski kodun (tests/support/pages/login.page.ts,
// pages/kullanici-degistir.page.ts, flows/test-baslangici.ts) davranışının genel giriş motoru
// (tests/support/giris-motoru.ts) için BİLDİRİMSEL karşılığı. Motor bu projeyi tanımaz; Galaksi'ye özgü
// seçiciler ve "Kullanıcı Değiştir" (acente değiştirme) akışı yalnızca burada durur.
// Eşleme (eski kod → tarif):
//   page.goto('/')                                              → girisAdresi/oturumKontrolAdresi "/"
//   locator('input[type="text"]').first()                       → kullaniciAlani (motor ilk eşleşeni kullanır)
//   locator('input[type="password"]').first()                   → parolaAlani
//   locator('button, input[type="submit"], input[type="image"]').first() (DoLogin görüntü düğmesi dahil)
//                                                               → gonderDugmesi (+ ikinci adımın gönder düğmesi)
//   getByText(ortak.login.basariGostergeMetni, { exact: true }) → basariGostergesi { metin }
//   (eski kodda yoktu) DoLogin hata penceresi                   → hataGostergeleri (hızlı ve açık hata)
//   CANLI: authenticatorRequired → locator('#Gauthcode')         → ikinciAdim { totp | sms, kodAlani #Gauthcode }
//   GIRIS_BEKLEME_SURESI_MS = 45 sn                             → zamanAsimiSn 45
//   KullaniciDegistirPage.acenteVeKullaniciDegistir            → baglamDegistirme (tür "Acente"; alanlar
//                                                                  acentePartaji, acentePartajiSecenegi, acenteKullanicisi)
// NOT: import.meta KULLANILMAZ (birim testleri bu dosyayı CommonJS'e çevirir).

export const GALAKSI_BASARI_METNI_VARSAYILAN = 'Oturumu Kapat';
export const GALAKSI_HATALI_GIRIS_METNI = 'Kullanıcı veya şifrenizi hatalı yazdınız!';
const GONDER = 'button, input[type="submit"], input[type="image"]';

/** "Kullanıcı Değiştir" (acente + kullanıcı) adımları — eski KullaniciDegistirPage ile aynı sıra ve beklemeler. */
export const GALAKSI_BAGLAM_ADIMLARI = Object.freeze([
  { islem: 'git', adres: '/kullanici-degistir', aciklama: 'Kullanıcı değiştir sayfası' },
  { islem: 'adresBekle', desen: 'kullanici-degistir$' },
  { islem: 'kosulBekle', ifade: "window.CHANNEL_OLD === '0'", aciklama: 'Sayfa hazır (CHANNEL_OLD)' },
  { islem: 'tikla', hedef: { secici: '#select2-ChangeChannel-container' }, aciklama: 'Acente listesini aç' },
  { islem: 'doldur', hedef: { secici: '.select2-container--open .select2-search__field' }, deger: '{acentePartaji}', aciklama: 'Acente partajını ara' },
  { islem: 'gorunurBekle', hedef: { secici: '#select2-ChangeChannel-results li', metin: '{acentePartajiSecenegi}' }, aciklama: 'Acente seçeneği görünür' },
  {
    islem: 'tikla', hedef: { secici: '#select2-ChangeChannel-results li', metin: '{acentePartajiSecenegi}' },
    yanitBekle: { yol: '/home/list-user/{acentePartaji}' }, aciklama: 'Acenteyi seç (kullanıcı listesi yüklenir)'
  },
  { islem: 'degerBekle', hedef: { secici: '#ChangeChannel' }, deger: '{acentePartaji}' },
  { islem: 'sayiBekle', hedef: { secici: '#ChangeUsername option[value="{acenteKullanicisi}"]' }, sayi: 1, aciklama: 'Kullanıcı listede var' },
  { islem: 'tikla', hedef: { secici: '#select2-ChangeUsername-container' }, aciklama: 'Kullanıcı listesini aç' },
  { islem: 'gorunurBekle', hedef: { secici: '#select2-ChangeUsername-results li', metin: '{acenteKullanicisi}', tamMetin: true }, zamanAsimiSn: 15 },
  { islem: 'tikla', hedef: { secici: '#select2-ChangeUsername-results li', metin: '{acenteKullanicisi}', tamMetin: true }, aciklama: 'Kullanıcıyı seç' },
  { islem: 'degerBekle', hedef: { secici: '#ChangeUsername' }, deger: '{acenteKullanicisi}' },
  { islem: 'tikla', hedef: { rol: 'button', ad: 'KULLANICI DEĞİŞTİR' }, adresBekle: 'kullanici-degistir-tamamlandi', aciklama: 'Kullanıcıyı değiştir' },
  { islem: 'git', adres: '/' },
  { islem: 'metinBekle', hedef: { secici: 'body' }, metin: '{acenteKullanicisi}', aciklama: 'Ana sayfada seçilen kullanıcı görünür' }
]);

/**
 * Galaksi ortamının giriş tarifi (eski kodun davranışı).
 * @param {{ ortamAnahtari: string; basariMetni?: string | null; ikiAsamaliTur?: 'yok' | 'totp' | 'sms' | null }} g
 *   ikiAsamaliTur: CANLI giriş profilinin 2FA türü (SMS/sabit kod profili ise 'sms'; aksi halde TOTP)
 */
export function galaksiGirisTarifi(g) {
  const canli = g.ortamAnahtari === 'canli';
  return {
    surum: 1,
    girisAdresi: '/',
    oturumKontrolAdresi: '/',
    kullaniciAlani: 'input[type="text"]',
    parolaAlani: 'input[type="password"]',
    gonderDugmesi: GONDER,
    basariGostergesi: { tur: 'metin', deger: g.basariMetni || GALAKSI_BASARI_METNI_VARSAYILAN },
    hataGostergeleri: [{ tur: 'metin', deger: GALAKSI_HATALI_GIRIS_METNI }],
    ikinciAdim: canli
      ? { tur: g.ikiAsamaliTur === 'sms' ? 'sms' : 'totp', kodAlani: '#Gauthcode', gonderDugmesi: GONDER, smsKipi: null, hataGostergeleri: [], elleBeklemeSn: 180 }
      : { tur: 'yok' },
    zamanAsimiSn: 45,
    baglamDegistirme: { baglamTuru: 'Acente', adimlar: GALAKSI_BAGLAM_ADIMLARI.map((a) => JSON.parse(JSON.stringify(a))) }
  };
}
