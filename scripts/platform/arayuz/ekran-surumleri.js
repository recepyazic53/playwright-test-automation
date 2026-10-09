// EKRAN SÜRÜMLERİ (arayüz) — Nöbetçi taramasının sonucu (koşu bitince açılan pencere; kosu-paneli.js) ve ekran sayfasındaki
// "Ekran sürümleri" sekmesi (ekranlar.js). Karşılaştırma bir önceki ekran sürümüyledir (sunucu: ekranlar/ekran-surumleri.mjs).
// Gelen alan "Modele ekle" ile modele eklenir; karar Değişiklikler sayfasında verilir.
import { api, bildir, bosDurum, h, ikon, rozet, tarihMetni, yerlestir } from './ortak.js';

const TURLER = {
  gelenAlan: ['gelen alan', 'basari'], kaybolanAlan: ['kaybolan alan', 'hata'], yeniSecenek: ['yeni seçenek', 'vurgu'],
  kaldirilanSecenek: ['kaldırılan seçenek', 'hata'], gelenDugme: ['gelen düğme', 'basari'], kaybolanDugme: ['kaybolan düğme', 'hata']
};

/**
 * Değişiklik listesi; gelen alanın yanında "Modele ekle".
 * @param {{ projeId: string; ekranId: string; degisiklikler: Array<{ tur: string; baslik: string; nerede: string; anahtar?: string }>; sonSurum: boolean }} s
 */
export function degisiklikListesi(s) {
  return h('ul', { class: 'ekran-surumu-listesi' }, s.degisiklikler.map((d) => {
    const [etiket, renk] = TURLER[d.tur] ?? [d.tur, null];
    const ekle = s.sonSurum && d.tur === 'gelenAlan' && d.anahtar
      ? h('button', { type: 'button', class: 'kucuk-dugme', onclick: async (olay) => {
        const b = /** @type {HTMLButtonElement} */ (olay.currentTarget);
        b.disabled = true;
        try {
          const y = await api('/platform/ekran/surum/modele-ekle', { govde: { projeId: s.projeId, ekranId: s.ekranId, anahtar: d.anahtar } });
          bildir(`“${d.baslik}” modele eklendi; Değişiklikler sayfasında onaylayın.`, 'basari');
          document.querySelector('dialog[open]')?.close();
          if (y.bulguSayisi) location.hash = `#/ekranlar/e/${encodeURIComponent(s.ekranId)}/bulgular`;
        } catch (h_) { bildir(h_.message, 'hata'); b.disabled = false; }
      } }, ikon('arti'), 'Modele ekle') : null;
    return h('li', {}, rozet(etiket, renk), h('span', {}, d.baslik), h('span', { class: 'soluk kucuk' }, d.nerede), ekle);
  }));
}

/** Taramanın özet cümlesi. @param {Record<string, any>} k */
export function surumOzeti(k) {
  if (k.ilk) return `Bu ekranın ilk taraması: ${k.alanSayisi} alan ve ${k.dugmeSayisi} düğme ekran sürümü ${k.surum} olarak kaydedildi. Bir sonraki taramada bununla karşılaştırılacak.`;
  return k.degisiklikler.length
    ? `Bir önceki ekran sürümüne göre ${k.degisiklikler.length} değişiklik var (ekran sürümü ${k.surum}).`
    : `Bir önceki ekran sürümüne göre değişiklik yok (ekran sürümü ${k.surum}).`;
}

/** Senaryonun geçtiği adımlar ve keşif notu. @param {Record<string, any>} k */
function gezilenler(k) {
  const p = [k.kesif ? 'keşif yapıldı' : 'keşif yapılamadı', k.gecilenAdimlar?.length ? `senaryonun geçtiği adımlar: ${k.gecilenAdimlar.join(', ')}` : 'senaryo ekran adımlarına ulaşamadı'];
  return `${p.join(' · ')}. Gezilmeyen yerler karşılaştırılmadı (önceki hâlleri korunur).`;
}

/**
 * Koşu bitince açılan sonuç penceresi. @param {Record<string, any>} yanit koşu yanıtı (ekranAnalizi / ekranAnaliziHatasi) @param {string} projeId
 */
export function taramaSonucuPenceresi(yanit, projeId) {
  const k = yanit.ekranAnalizi;
  const hata = k ? null : yanit.ekranAnaliziHatasi ? `Ekran okunamadı: ${yanit.ekranAnaliziHatasi}` : 'Ekran okunamadı: koşu ekrana ulaşamadı.';
  const kapat = h('button', { type: 'button' }, 'Kapat');
  const diyalog = h('dialog', { class: 'onay-diyalogu ekran-surumu-diyalogu', 'aria-labelledby': 'ekran-surumu-basligi' },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: 'ekran-surumu-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('ara')), 'Nöbetçi taraması: sonuç'),
      hata ? h('p', { class: 'hata-metni' }, hata) : h('p', {}, surumOzeti(k)),
      k && k.degisiklikler.length ? degisiklikListesi({ projeId, ekranId: k.ekranId, degisiklikler: k.degisiklikler, sonSurum: true }) : null,
      k ? h('p', { class: 'soluk kucuk' }, gezilenler(k)) : null,
      ...(k?.notlar ?? []).map((n) => h('p', { class: 'soluk kucuk' }, n))),
    h('div', { class: 'diyalog-alt' },
      k ? h('a', { class: 'dugme hayalet', href: `#/ekranlar/e/${encodeURIComponent(k.ekranId)}/surumler`, onclick: () => diyalog.close() }, 'Ekran sürümleri') : null, kapat));
  kapat.addEventListener('click', () => diyalog.close());
  diyalog.addEventListener('close', () => diyalog.remove());
  document.body.append(diyalog);
  diyalog.showModal();
  kapat.focus();
}

/** Ekran sayfası > "Ekran sürümleri" sekmesi. @param {HTMLElement} alan @param {{ proje: { id: string } }} s @param {{ id: string }} e */
export async function ekranSurumleriSekmesi(alan, s, e) {
  const v = await api(`/platform/ekran/surumler?projeId=${encodeURIComponent(s.proje.id)}&ekranId=${encodeURIComponent(e.id)}`);
  if (!v.gecmis.length) {
    yerlestir(alan, bosDurum('Henüz tarama yok.', 'Modeli güncelle > Nöbetçi taraması: Nöbetçi ekranı keşfeder, seçtiğiniz senaryoyla doldurur ve gördüğü hâli ekran sürümü olarak kaydeder. Sonraki taramalar bir öncekiyle karşılaştırılır.', { ikon: 'ara' }));
    return;
  }
  const sifirla = async () => {
    const { onayIste } = await import('./kosu-paneli.js');
    if (!(await onayIste({ baslik: 'Ekran sürümleri sıfırlansın mı?', metin: 'Bütün ekran sürümleri ve geçmişi silinir; bir sonraki Nöbetçi taraması ilk tarama olur (yalnız kaydeder). Model ve senaryolar değişmez.', dugme: 'Sıfırla', ikonAd: 'uyari' }))) return;
    try {
      await api('/platform/ekran/surumler/sifirla', { govde: { projeId: s.proje.id, ekranId: e.id } });
      bildir('Ekran sürümleri sıfırlandı.', 'basari');
      await ekranSurumleriSekmesi(alan, s, e);
    } catch (h_) { bildir(h_.message, 'hata'); }
  };
  yerlestir(alan, h('div', { class: 'ekran-surumleri' },
    h('div', { class: 'ekran-surumleri-ust' }, h('p', { class: 'soluk' }, `Son ekran sürümünde ${v.alanSayisi} alan ve ${v.dugmeSayisi} düğme var. Her tarama bir öncekiyle karşılaştırılır.`),
      h('button', { type: 'button', class: 'kucuk-dugme hayalet', onclick: sifirla }, ikon('yenile'), 'Sürümleri sıfırla')),
    v.gecmis.map((k, i) => h('details', { class: 'kart ekran-surumu', ...(i === 0 ? { open: true } : {}) },
      h('summary', {}, h('b', {}, `Ekran sürümü ${k.surum}`), h('span', { class: 'soluk' }, ` · ${tarihMetni(k.zaman)} · ${k.senaryoBaslik}`), ' ',
        k.ilk ? rozet('ilk tarama', 'vurgu') : k.degisiklikler.length ? rozet(`${k.degisiklikler.length} değişiklik`, 'hata') : rozet('değişiklik yok', 'basari')),
      h('p', {}, surumOzeti(k)),
      k.degisiklikler.length ? degisiklikListesi({ projeId: s.proje.id, ekranId: e.id, degisiklikler: k.degisiklikler, sonSurum: i === 0 }) : null,
      h('p', { class: 'soluk kucuk' }, gezilenler(k))))));
}
