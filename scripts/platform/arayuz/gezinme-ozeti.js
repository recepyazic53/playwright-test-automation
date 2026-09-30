// KAYITTAKİ ADRES DEĞİŞİMLERİ DÖKÜMÜ (arayüz; "Akışı kaydet" ve "Girişi kaydet" onay ekranlarında ortak).
// HER ZAMAN bir özet satırı gösterir: "Kayıtta N adres değişimi görüldü: M tanesi adım oldu, K tanesi alınmadı (nedeni …)" — sessiz
// kayıp olmaz. Başka siteye gidildiyse uyarı satırı ("Şu siteye gidildi: <köken>; ortamın adresi dışında olduğu için alınmadı.") ve
// (ortamın ek taban adreslerinde yoksa) "ek taban adres olarak ekleyeyim mi" onayı (yasaklı adres eklenmez). Açılan pencereler
// bilgi satırı olarak yazılır (oynatma açılan pencereleri kendisi izler).
import { api, h } from './ortak.js';
import { onayIste } from './kosu-paneli.js';

/**
 * @param {{ ozet: { baskaSiteler: Array<{ koken: string; kayitli: boolean }>; pencereler?: Array<{ olay: string; yol: string }> }; ozetMetni: string; uyarilar: string[] }} g
 * @param {{ id?: string } | null | undefined} ortam @param {string} projeId
 */
export function gezinmeOzetiKutusu(g, ortam, projeId) {
  const durum = h('div', { role: 'status', 'aria-live': 'polite' });
  const uyarilar = g.ozet.baskaSiteler.map((b, i) => {
    const not = h('div', { class: 'not-kutusu uyari gezinme-uyarisi', role: 'note' },
      h('p', {}, g.uyarilar[i] || `Şu siteye gidildi: ${b.koken}; ortamın adresi dışında olduğu için alınmadı.`));
    if (!b.kayitli && ortam && ortam.id) {
      const ekle = h('button', { type: 'button', class: 'kucuk-dugme' }, 'Bu adresi ortamın ek taban adresi olarak ekle');
      ekle.addEventListener('click', async () => {
        const tamam = await onayIste({
          baslik: 'Bu adresi ortamın ek taban adresi olarak ekleyeyim mi?',
          metin: `${b.koken} adresi ortamın taban adresleri listesine eklenir (ortamın asıl adresi değişmez; yasaklı adres kalıbına uyuyorsa eklenmez). Bu kayıttaki gidiş adım olmaz: adımın olması için adresi ekledikten sonra kaydı yeniden yapın.`,
          dugme: 'Evet, ekle', ikonAd: 'ag'
        });
        if (!tamam) return;
        try {
          await api('/platform/giris-tarifi/taban-adresi-ekle', { govde: { projeId, ortamId: ortam.id, adres: b.koken } });
          durum.replaceChildren(h('div', { class: 'not-kutusu basari' }, `${b.koken} ortamın ek taban adresi olarak eklendi. Adımın olması için kaydı yeniden yapın.`));
          ekle.disabled = true;
        } catch (hata) { durum.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, hata.message)); }
      });
      not.append(ekle);
    }
    return not;
  });
  const pencereler = (g.ozet.pencereler || []).map((p) => h('p', { class: 'kucuk soluk', 'data-gezinme-pencere': '' },
    p.olay === 'acildi' ? `Açılan pencerede${p.yol ? `: ${p.yol}` : ''} (oynatmada pencere kendiliğinden izlenir; alınmadı).` : 'Pencere kapandı; ana sayfaya dönüldü.'));
  return h('div', { class: 'gezinme-ozeti', 'data-gezinme-ozeti': '' }, h('p', { class: 'kucuk', 'data-gezinme-ozet-metni': '' }, g.ozetMetni), ...uyarilar, ...pencereler, durum);
}
