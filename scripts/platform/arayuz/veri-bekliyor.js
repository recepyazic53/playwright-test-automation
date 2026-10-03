// "VERİ BEKLİYOR" SENARYOSU (arayüz; sunucu kuralı senaryolar/veri-bekliyor.mjs). Hızlı test kaydında seçilen "veri gerekli" öneri değer
// uydurulmadan koşu dışı kaydedilir; değeri olmayan alanlar test verisinde kendi satırında boştur.
//   veriBekliyorNotu   senaryo ekranındaki uyarı: "Veri bekliyor: X, Y" + eksik hücrelere giden "Değerleri doldur" (Test verisi'nde satır
//                      açılır, boş hücreler vurgulanır). Hücreler dolunca uyarı kalkar; senaryo hâlâ koşu dışıysa tek tıkla "Koşuya dahil et"
//                      önerilir (otomatik yapılmaz).
//   veriBekliyorAdresi Test verisi'nde satırı açan adres (#/veri/satir/<tablo>/<satır>?sutun=…).
// Değer GÖSTERİLMEZ; kullanıcı verisi DOM'a yalnız metin olarak yazılır (h()).
import { api, bildir, h, ikon, yerlestir } from './ortak.js';

const q = encodeURIComponent;

/** Test verisi'nde satırı açan ve boş hücreleri vurgulayan adres. @param {{ tabloId: string; satirId: string }} b @param {string[]} sutunlar */
export const veriBekliyorAdresi = (b, sutunlar) => `#/veri/satir/${q(b.tabloId)}/${q(b.satirId)}${sutunlar.length ? `?${sutunlar.map((s) => `sutun=${q(s)}`).join('&')}` : ''}`;

/**
 * Senaryo ekranının "veri bekliyor" uyarısı; işaret yoksa ya da hücreler dolu ve senaryo koşudaysa null.
 * @param {{ senaryo: any; projeId: string; kosuyaDahil: boolean; dahilEdildi?: () => void }} s
 * @returns {HTMLElement | null}
 */
export function veriBekliyorNotu(s) {
  const vb = s.senaryo && s.senaryo.veriBekliyor;
  if (!vb) return null;
  const bekleyen = Array.isArray(vb.bekleyen) ? vb.bekleyen : [];
  if (bekleyen.length) {
    /** @type {Map<string, { tabloId: string; satirId: string; tablo: string | null; satirAdi: string | null; sutunlar: string[] }>} */
    const satirlar = new Map();
    for (const b of bekleyen) {
      const k = `${b.tabloId}|${b.satirId}`;
      if (!satirlar.has(k)) satirlar.set(k, { tabloId: b.tabloId, satirId: b.satirId, tablo: b.tablo, satirAdi: b.satirAdi, sutunlar: [] });
      satirlar.get(k)?.sutunlar.push(b.sutun);
    }
    const adlar = [...new Set(bekleyen.map((b) => b.etiket))].join(', ');
    const birden = satirlar.size > 1;
    return h('div', { class: 'not-kutusu uyari veri-bekliyor-notu', role: 'note' },
      h('p', {}, h('b', {}, `Veri bekliyor: ${adlar}`)),
      h('p', { class: 'kucuk' }, 'Bu alanların değeri yok (değer üretilmez). Senaryo toplu koşuya dahil değil; çalıştırılırsa “Şu alanların değeri yok” hatasıyla durur. Değerleri test verisi satırında doldurun.'),
      h('div', { class: 'dugmeler' }, [...satirlar.values()].map((r) => {
        const yok = !r.tablo || !r.satirAdi;
        return yok
          ? h('span', { class: 'kucuk' }, `${r.tablo ? `“${r.tablo}” tablosunda` : 'Tablo'} satır bulunamadı — Test verisi'nde ekleyin.`)
          : h('a', { class: 'dugme kucuk-dugme veri-bekliyor-doldur', href: veriBekliyorAdresi(r, r.sutunlar), title: `${r.tablo} › ${r.satirAdi}: ${r.sutunlar.join(', ')}` },
            ikon('veri'), birden ? `Değerleri doldur: ${r.tablo}` : 'Değerleri doldur');
      })));
  }
  if (s.kosuyaDahil) return null;
  // Hücreler doldu, senaryo hâlâ koşu dışı: koşuya almak kullanıcının kararı (tek tıkla).
  const dugme = h('button', { type: 'button', class: 'kucuk-dugme birincil' }, ikon('onay'), 'Toplu koşuya dahil et');
  const not = h('div', { class: 'not-kutusu basari veri-bekliyor-notu', role: 'note' },
    h('p', {}, h('b', {}, 'Değerler dolduruldu. '), 'Bu senaryo “veri bekliyor” olarak toplu koşu dışında kaydedilmişti; isterseniz şimdi toplu koşuya dahil edin.'),
    h('div', { class: 'dugmeler' }, dugme));
  dugme.addEventListener('click', async () => {
    dugme.disabled = true;
    try {
      await api('/platform/senaryo/kosuya-dahil', { govde: { projeId: s.projeId, idler: [s.senaryo.id], dahil: true } });
      bildir('Senaryo toplu koşuya dahil edildi.');
      if (s.dahilEdildi) s.dahilEdildi();
      yerlestir(not, h('p', {}, h('b', {}, 'Toplu koşuya dahil edildi. '), '“Koşuyu başlat” bu senaryoyu da koşar.'));
    } catch (e) {
      dugme.disabled = false;
      if (e && e.durum === 423) return;
      bildir(e && e.message ? e.message : String(e), 'hata');
    }
  });
  return not;
}
