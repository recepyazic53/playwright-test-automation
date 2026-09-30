// SERVİS SONUÇLARI "SON DURUM": Sonuçlar > Servisler'in başlık rozeti ve kartları her kaynağın (servis / akış) SON koşusunun
// toplamından hesaplanır (ekranlardaki "her ekranın son tam koşusu" ile aynı). En yeni tek koşu başarılıyken başka bir servisin son
// koşusu başarısızsa "hepsi geçti" yazılmaz. Saf hesap (veritabanı yok); değerler sahte.
import { expect, test } from '@playwright/test';
import { sonDurumOzeti, type ServisKosuOzeti } from '../../scripts/platform/sonuclar/servis-sonuclari.mjs';

let sira = 0;
const kosu = (tur: 'servis' | 'akis', kaynakId: string, basarili: number, basarisiz: number, ek: Partial<ServisKosuOzeti> = {}): ServisKosuOzeti => {
  sira++;
  const baslangic = new Date(Date.UTC(2026, 8, 1, 0, sira)).toISOString();
  return {
    id: `${tur === 'akis' ? 'a' : 's'}-${sira}`, tur, kaynakId, baslik: kaynakId, ortamId: 'o1', ortam: 'TEST', calistirma: 'kosu',
    baslangic, bitis: baslangic, sureMs: 1000, toplam: basarili + basarisiz, basarili, basarisiz, hata: 0, atlanan: 0, durduruldu: 0, ...ek
  };
};

test('son durum: her kaynağın son koşusu toplanır; en yeni koşu başarılı olsa da başka servisin başarısız son koşusu sayılır', () => {
  const kosular = [
    kosu('servis', 'katalog', 3, 0),
    kosu('servis', 'odeme', 1, 2), // ödemenin son koşusu: 2 başarısız
    kosu('servis', 'katalog', 2, 1), // kataloğun son koşusu: 1 başarısız
    kosu('akis', 'siparis', 4, 0) // en yeni: akış, hepsi geçti
  ];
  const { simdi, onceki, seri } = sonDurumOzeti(kosular);
  expect(simdi).toMatchObject({ basarili: 1 + 2 + 4, basarisiz: 2 + 1, toplam: 3 + 3 + 4, kaynak: 3, basarisizKaynak: 2, servis: 2, akis: 1, sureMs: 3000 });
  // Önceki = en yeni koşudan önceki son durum (akış yok).
  expect(onceki).toMatchObject({ basarili: 3, basarisiz: 3, kaynak: 2, akis: 0 });
  expect(seri).toHaveLength(4);
  expect(seri[0]).toMatchObject({ basarili: 3, basarisiz: 0, kaynak: 1 });
});

test('son durum: tek kaynak → o kaynağın son koşusu; koşu yoksa boş', () => {
  const a = kosu('servis', 'tek', 5, 0);
  const b = kosu('servis', 'tek', 4, 1, { hata: 1, toplam: 6 });
  const { simdi, onceki } = sonDurumOzeti([a, b]);
  expect(simdi).toMatchObject({ basarili: 4, basarisiz: 1, hata: 1, toplam: 6, kaynak: 1, basarisizKaynak: 1 });
  expect(onceki).toMatchObject({ basarili: 5, basarisiz: 0, basarisizKaynak: 0 });
  expect(sonDurumOzeti([])).toEqual({ simdi: null, onceki: null, seri: [] });
  // Kıvılcım için en çok 30 nokta.
  expect(sonDurumOzeti(Array.from({ length: 40 }, () => kosu('servis', 'x', 1, 0))).seri).toHaveLength(30);
});
