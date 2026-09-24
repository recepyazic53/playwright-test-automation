// Konsol özeti ve paylaşım için kısa markdown özeti.
import { kacHesapla } from './veri-siniflandirma.mjs';

// --- 4) Konsola kısa özet (hızlı bakış) ---
export function konsolOzetiYaz({ ortam, sonKosuEtiketi, sonKosuOzet, kosuSayisi, tamKosuSayisi }) {
  console.log(
    `\n${ortam.toUpperCase()} ortamı - güncel durum: ${sonKosuEtiketi} (kayıtlı koşu sayısı: ${kosuSayisi}, koşu: ${tamKosuSayisi}, tekil: ${kosuSayisi - tamKosuSayisi})\n`
  );
  console.log(
    `Toplam: ${kacHesapla(sonKosuOzet) + sonKosuOzet.durduruldu} test | Başarılı: ${sonKosuOzet.basarili} | Başarısız: ${sonKosuOzet.basarisiz} | Atlanan: ${sonKosuOzet.atlanan} | Durduruldu: ${sonKosuOzet.durduruldu}`
  );
  console.table(
    Object.entries(sonKosuOzet.urunToplamlari).map(([urun, s]) => ({
      Ürün: urun,
      Başarılı: s.basarili,
      Başarısız: s.basarisiz,
      Atlanan: s.atlanan,
      Durduruldu: s.durduruldu
    }))
  );
  console.log(`\nDetaylı, tarih aralığı filtrelenebilir hata kalıbı tablosu için dashboard-${ortam}.html dosyasını açın.`);
}

// --- 5) Kısa markdown özeti (paylaşım için) ---
export function markdownOzetiOlustur({ ortam, sonKosuEtiketi, sonKosuOzet, oncekiKosuOzet }) {
  const markdownSatirlari = [
    `# ${ortam.toUpperCase()} Ortamı - Hata ve Başarı Özeti`,
    '',
    `Güncel durum: ${sonKosuEtiketi}`,
    '',
    `Toplam: ${kacHesapla(sonKosuOzet) + sonKosuOzet.durduruldu} test | Başarılı: ${sonKosuOzet.basarili} | Başarısız: ${sonKosuOzet.basarisiz} | Atlanan: ${sonKosuOzet.atlanan} | Durduruldu: ${sonKosuOzet.durduruldu}`,
    ''
  ];
  if (oncekiKosuOzet) {
    markdownSatirlari.push(
      `Her ürünün önceki koşusuna göre değişim: Başarılı ${sonKosuOzet.basarili - oncekiKosuOzet.basarili >= 0 ? '+' : ''}${sonKosuOzet.basarili - oncekiKosuOzet.basarili}, ` +
        `Başarısız ${sonKosuOzet.basarisiz - oncekiKosuOzet.basarisiz >= 0 ? '+' : ''}${sonKosuOzet.basarisiz - oncekiKosuOzet.basarisiz}`,
      ''
    );
  }
  markdownSatirlari.push(
    `_Ürün bazlı hata kalıpları ve tarih aralığı filtresi için dashboard-${ortam}.html dosyasını açın._`
  );
  return markdownSatirlari.join('\n');
}
