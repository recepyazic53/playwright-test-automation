// Senaryoya özel ödeme kartının (dashboard > "Senaryo Oluştur" > "Ödeme bilgileri",
// jet-seyahat.json > senaryolar[].krediKarti) saf (Playwright'a bağımlı olmayan) doğrulaması.
//
// Kurallar scripts/test-sunucu.mjs > senaryoKrediKartiniDogrula ve dashboard'daki
// senaryoFormuDogrula ile AYNI tutulmalı:
//  - Ödeme adımı dahil değilken (odemeAdimiDahil: false) kart verilemez.
//  - Kart numarası 16 hane, güvenlik kodu (CVV) 3-4 hane.
//  - Son kullanma ayı 1-12, son kullanma yılı 4 haneli ve geçmişte değil.
//  - Taksit 1-12 arası bir tam sayı.
// Hata mesajları kart numarasını/CVV'yi ASLA içermez (rapor ve sunucu loglarına düşmesin).
//
// NOT: Bu dosya yalnızca tip import eder — böylece Playwright olmadan (ör. küçük bir Node
// betiğiyle, --experimental-strip-types) birim olarak denenebilir.
import type { SenaryoKrediKartiData, SelectData } from './test-data';

const TAKSIT_UST_SINIRI = 12;

function tamSayiMi(deger: string, alt: number, ust: number): boolean {
  if (!/^\d{1,2}$/.test(deger)) return false;
  const sayi = Number(deger);
  return sayi >= alt && sayi <= ust;
}

function secimDegeri(secim: SelectData | undefined): string {
  return secim && typeof secim.deger === 'string' ? secim.deger.trim() : '';
}

/**
 * Senaryonun kendi kartını doğrular. Kart yoksa (senaryo ortak kartı kullanacak) hiçbir
 * şey yapmaz; kurala uymayan veride açıklayıcı bir Türkçe hata fırlatır.
 * bugun: yıl kontrolü için (birim testte sabit bir tarih verilebilsin diye parametre).
 */
export function senaryoKrediKartiniDogrula(
  krediKarti: SenaryoKrediKartiData | undefined,
  odemeAdimiDahil: boolean,
  senaryoAdi = 'Senaryo',
  bugun: Date = new Date()
): void {
  if (krediKarti === undefined) return;
  const hata = (mesaj: string): Error => new Error(`${senaryoAdi}: ${mesaj}`);

  if (!odemeAdimiDahil) {
    throw hata('Ödeme adımı dahil değilken (odemeAdimiDahil: false) "krediKarti" verilemez.');
  }
  if (!krediKarti || typeof krediKarti !== 'object') {
    throw hata('"krediKarti" bir nesne olmalıdır.');
  }
  if (typeof krediKarti.isim !== 'string' || !krediKarti.isim.trim()) {
    throw hata('Kart üzerindeki ad boş olamaz.');
  }
  if (typeof krediKarti.soyisim !== 'string' || !krediKarti.soyisim.trim()) {
    throw hata('Kart üzerindeki soyad boş olamaz.');
  }
  if (typeof krediKarti.kartNo !== 'string' || !/^\d{16}$/.test(krediKarti.kartNo)) {
    throw hata('Kart numarası 16 haneli olmalıdır (yalnızca rakam).');
  }
  if (typeof krediKarti.guvenlikKodu !== 'string' || !/^\d{3,4}$/.test(krediKarti.guvenlikKodu)) {
    throw hata('Güvenlik kodu (CVV) 3 ya da 4 haneli olmalıdır.');
  }
  if (!tamSayiMi(secimDegeri(krediKarti.sonKullanmaAyi), 1, 12)) {
    throw hata('Son kullanma ayı 1-12 arasında olmalıdır.');
  }
  const yil = secimDegeri(krediKarti.sonKullanmaYili);
  if (!/^\d{4}$/.test(yil)) {
    throw hata('Son kullanma yılı 4 haneli olmalıdır.');
  }
  if (Number(yil) < bugun.getFullYear()) {
    throw hata(`Son kullanma yılı (${yil}) geçmişte olamaz.`);
  }
  if (!tamSayiMi(secimDegeri(krediKarti.taksit), 1, TAKSIT_UST_SINIRI)) {
    throw hata(`Taksit 1-${TAKSIT_UST_SINIRI} arasında olmalıdır.`);
  }
}
