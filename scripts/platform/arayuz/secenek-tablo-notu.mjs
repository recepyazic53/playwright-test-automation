// SEÇENEK BULGUSUNUN TABLO NOTU (saf; tarayıcı ve testler kullanır) — Değişiklikler ekranında yeni / kaldırılan seçenek bulgusu
// bağlı test verisi tablosuna da yansıtılacak mı, yansıtıldı mı, yansıtılamıyorsa neden ve kullanıcının ne yapması gerektiği; kısa,
// sade cümleler. Bulguyu kabul etmek yalnız EKRAN MODELİNİ günceller; tablo yalnız öneri uygulanabilir ve seçiliyse güncellenir.
// Tablo ve sütun her zaman adıyla yazılır. Öneri: tablolar/secenek-tablosu.mjs tabloOnerisi (nedenKodu); yazma sonucu: analizin
// tabloSonuclari (eklendi / zatenVardi / silindi / zatenYoktu).
//   secenekTabloNotu(oneri, durum)  → tek cümle(ler); "Test verisi" geçiyorsa arayüz onu Test verisi sayfasına bağlantı yapar.

/**
 * @typedef {{ tabloAd: string; sutun: string; islem: 'ekle' | 'cikar'; uygulanabilir: boolean; nedenKodu?: string; neden?: string }} Oneri
 * @typedef {{ durum: string; satir?: number }} Sonuc
 * @typedef {{ uygulandi?: boolean; karar?: string | null; secili?: boolean; sonuc?: Sonuc | null; kayitli?: boolean; sayi?: number }} Durum
 *   uygulandi: kararlar uygulandı mı · karar: 'kabul' | 'red' | null · secili: (karar öncesi) "tabloya da yansıt" işaretli mi ·
 *   sonuc: uygulanmış bulgunun tablo sonucu (null: tabloya yazılmadı) · kayitli: uygulanmış analizde sonuç kaydı var mı (eski kayıtlarda yok) ·
 *   sayi: aynı alanın birden çok bulgusu için tek not (grup başlığı)
 */

/** @param {Oneri} o @param {Durum} [d] @returns {string} */
export function secenekTabloNotu(o, d = {}) {
  const T = `"${o.tabloAd}"`;
  const S = `"${o.sutun}"`;
  const ekle = o.islem === 'ekle';
  const cok = (d.sayi ?? 1) > 1;
  const uygulandi = d.uygulandi === true;
  const yalnizModel = uygulandi ? 'yalnız ekran modeli güncellendi' : 'kabul ederseniz yalnız ekran modeli güncellenir';
  if (uygulandi && d.karar !== 'kabul') return `Kabul edilmediği için ${T} tablosu değişmedi.`;

  if (!o.uygulanabilir) {
    const basi = ekle ? (uygulandi ? 'Tabloya eklenmedi' : 'Tabloya eklenmeyecek') : (uygulandi ? 'Tablodan silinmedi' : 'Tablodan silinmeyecek');
    const neden = {
      cokSutun: `${T} tablosunda birden çok sütun var`,
      secimeGore: `bu alanın tablosu başka bir alandaki seçime göre değişiyor (varsayılan: ${T} tablosu, ${S} sütunu)`,
      tabloYok: `alanın bağlı olduğu ${T} tablosu bulunamadı`,
      baglamTablosu: `${T} bir bağlam profili tablosu; seçenekler oraya otomatik yazılmaz`,
      sutunYok: `${T} tablosunda ${S} sütunu yok`,
      sutunGizli: `${T} tablosunun ${S} sütunu gizli; gizli sütuna otomatik yazılmaz`
    }[String(o.nedenKodu)] || o.neden || 'tablo otomatik güncellenemiyor';
    const deger = cok ? 'Bu değerlerle' : 'Bu değerle';
    const satir = cok ? 'satırları' : 'satırı';
    const tavsiye = ekle
      ? ({
        secimeGore: `${deger} test etmek isterseniz ${satir} Test verisi'nde uygun tabloya ekleyin.`,
        tabloYok: 'Alanın tablo bağını ekran sayfasının "Test verisi" sekmesinden kontrol edin.',
        sutunYok: `Sütunu Test verisi > ${T} tablosuna ekleyin ya da alanın bağını düzeltin.`
      }[String(o.nedenKodu)] || `${deger} test etmek isterseniz ${satir} Test verisi > ${T} tablosuna ekleyin (${S} sütunu).`)
      : ({
        secimeGore: `${cok ? 'Bu değerleri' : 'Bu değeri'} taşıyan satırlar varsa Test verisi'nde ilgili tablodan silin.`,
        tabloYok: 'Alanın tablo bağını ekran sayfasının "Test verisi" sekmesinden kontrol edin.'
      }[String(o.nedenKodu)] || `${cok ? 'Bu değerleri' : 'Bu değeri'} taşıyan satırlar varsa Test verisi > ${T} tablosundan silin (${S} sütunu).`);
    return `${basi}: ${neden}. ${yalnizModel[0].toLocaleUpperCase('tr')}${yalnizModel.slice(1)}. ${tavsiye}`;
  }

  if (!uygulandi) {
    if (d.secili === false) {
      return ekle ? `Tabloya eklenmeyecek (işaret kaldırıldı); ${yalnizModel}.` : `Tablodan silinmeyecek (işaret kaldırıldı); ${yalnizModel}.`;
    }
    const kac = cok ? `${d.sayi} değer ` : '';
    return ekle
      ? `Kabul ederseniz ${kac}${T} tablosunun ${S} sütununa satır olarak eklenecek.`
      : `Kabul ederseniz ${cok ? `${d.sayi} değeri` : 'bu değeri'} taşıyan satırlar ${T} tablosundan silinecek (${S} sütunu).`;
  }
  if (d.kayitli === false) return `Tabloya yazılıp yazılmadığı bu kayıtta yok; Test verisi > ${T} tablosundan kontrol edin.`;
  const s = d.sonuc;
  if (!s) return ekle ? `Tabloya eklenmedi (seçilmemişti); ${yalnizModel}.` : `Tablodan silinmedi (seçilmemişti); ${yalnizModel}.`;
  if (s.durum === 'eklendi') return `${T} tablosunun ${S} sütununa satır olarak eklendi.`;
  if (s.durum === 'zatenVardi') return `${T} tablosunun ${S} sütununda bu değer zaten vardı; yeni satır eklenmedi.`;
  if (s.durum === 'silindi') return `${T} tablosundan ${s.satir ?? 1} satır silindi (${S} sütunu).`;
  return `${T} tablosunun ${S} sütununda bu değer yoktu; silinecek satır olmadı.`;
}
