// EKİP PAYLAŞIMI kartı (Ayarlar > Yedekleme). Sunucu: /platform/ortak/* (ortak-paylasim.mjs).
// Ortak klasör (OneDrive / ağ sürücüsü) seçilir; "Yayınla" yeni sürüm yazar, "Güncelle" son sürümü içe aktarma önizlemesiyle alır.
// Giriş bilgileri ve entegrasyon gizlileri kişiye özeldir: yayına girmez, güncellemede yerel değer korunur.
// Güncel değilken "Birleştir ve yayınla": son sürümdeki, sizin en son aldığınızdan sonra yapılan değişiklikler listelenir (dahil et / etme;
// ikinizin de değiştirdiğinde onunki / benimki); seçilenler alınır, sizinkiler kalır ve birleşmiş hâl yeni sürüm olur (ortak-birlestirme.mjs).
import { api, bildir, h, ikon, mesajKutusu, mesgulIken, parolaAlani, tarihMetni, boyutMetni, yeniKimlik } from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';

/**
 * @param {Record<string, any>} ortak GET /platform/ortak/durum > ortak
 * @param {{ yenile: () => void; projeleriYenile: () => Promise<void>; akisAlani: HTMLElement; gizle: (gizli: boolean) => void }} baglam
 */
export function ortakPaylasimKarti(ortak, kullaniciAdi, baglam) {
  const mesaj = mesajKutusu();
  const girdi = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', class: 'mono', value: ortak.klasor || '', placeholder: 'Örn. C:\\Users\\ben\\OneDrive\\NobetciOrtak', 'aria-label': 'Ortak klasör (tam yol)' });
  const kaydet = h('button', { type: 'button' }, ikon('onay'), 'Kaydet');
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      await mesgulIken(kaydet, 'Denetleniyor…', () => api('/platform/ortak/klasor', { govde: { klasor: girdi.value } }));
      bildir(girdi.value.trim() ? 'Ortak klasör kaydedildi.' : 'Ekip paylaşımı kapatıldı.');
      baglam.yenile();
    } catch (hata) { mesaj.goster(hata.message); }
  });

  let durumKutusu = null;
  let eylemler = null;
  if (ortak.klasor && ortak.bulunamadi) {
    durumKutusu = h('p', { class: 'kart-ozet not-kutusu uyari kucuk', role: 'note' }, 'Ortak klasör bulunamadı; OneDrive / ağ klasörünün bu bilgisayarda açık olduğundan emin olun.');
  } else if (ortak.klasor) {
    const son = ortak.surumler[0];
    durumKutusu = ortak.guncelleVar
      ? h('p', { class: 'kart-ozet not-kutusu uyari', role: 'status' }, ikon('uyari'), ` Yeni sürüm var: v${ortak.sonSurum}${son ? ` (${son.yapan || 'bilinmiyor'}, ${tarihMetni(son.zaman)})` : ''}. Sizdeki: ${ortak.benimSurum ? `v${ortak.benimSurum}` : 'hiç alınmadı'}. Yayınlamadan önce güncelleyin.`)
      : h('p', { class: 'not-kutusu kucuk', role: 'status' }, ortak.sonSurum ? `Güncelsiniz (v${ortak.sonSurum}).` : 'Klasörde henüz yayınlanmış sürüm yok.');

    // Güncel değilken yayın: önce birleştirme (onun değişikliklerinden hangileri dahil edilsin).
    const yayinla = h('button', { type: 'button' }, ikon('yukle'), ortak.guncelleVar ? 'Birleştir ve yayınla' : 'Yayınla');
    const not = h('input', { type: 'text', maxlength: '300', placeholder: 'Ne değişti? (isteğe bağlı)', 'aria-label': 'Sürüm notu' });
    yayinla.addEventListener('click', async () => {
      mesaj.temizle();
      if (ortak.guncelleVar) { birlestirmeFormu(not.value); return; }
      try {
        const y = await mesgulIken(yayinla, 'Yayınlanıyor…', () => api('/platform/ortak/yayinla', { govde: { not: not.value } }));
        bildir(`v${y.kayit.surum} yayınlandı.`); window.dispatchEvent(new Event('ortak-durum-degisti'));
        baglam.yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    const guncelle = h('button', { type: 'button', class: ortak.guncelleVar ? 'birincil' : '', disabled: !ortak.sonSurum, 'data-ortak-guncelle': '' }, ikon('indir'), 'Güncelle');
    guncelle.addEventListener('click', () => guncelleFormu());
    if (ortak.geriDonus) durumKutusu = h('p', { class: 'kart-ozet not-kutusu uyari', role: 'status' }, ikon('uyari'), ` Eski bir sürümdesiniz (v${ortak.benimSurum}); klasördeki son sürüm v${ortak.sonSurum}. Yayınlarsanız bu hâliniz yeni sürüm olur.`);
    eylemler = h('div', {}, h('div', { class: 'satir-girdi' }, not, yayinla), h('div', { class: 'dugmeler' }, guncelle));
  }

  // Güncelle: kasa parolası (ekipte ortak) → içe aktarma önizlemesi (eklenecek / değişecek) → seçim → uygula.
  function guncelleFormu(hedefSurum) {
    const parola = parolaAlani('Ekibin ortak kasa parolası', { zorunlu: true, otomatik: 'current-password' });
    const m = mesajKutusu();
    const git = h('button', { type: 'submit', class: 'birincil' }, 'Önizle');
    const form = h('form', { class: 'kart', novalidate: true },
      h('h3', {}, hedefSurum ? `v${hedefSurum} sürümüne dön` : 'Son sürümü al'),
      h('p', { class: 'soluk' }, 'Yedekteki kayıtlar bu bilgisayardakilerle karşılaştırılır; neyin ekleneceğini ve değişeceğini görürsünüz. Giriş bilgileriniz ve entegrasyon gizlileriniz değişmez; bu bilgisayardaki kayıtlar silinmez.' + (hedefSurum ? ' Geri dönüşte, o sürümden sonra değiştirilen kayıtlar eski hâline döner (önceki hâlleri değişiklik geçmişinde kalır); sonradan eklenen kayıtlar silinmez.' : '')),
      m.kutu, parola.kapsayici,
      h('div', { class: 'dugmeler' }, git, h('button', { type: 'button', class: 'hayalet', onclick: () => { baglam.akisAlani.replaceChildren(); baglam.gizle(false); } }, 'Vazgeç')));
    form.addEventListener('submit', async (olay) => {
      olay.preventDefault();
      if (!parola.girdi.value) { m.goster('Kasa parolasını girin.'); return; }
      try {
        const { isId, surum } = await mesgulIken(git, 'Hazırlanıyor…', () => api('/platform/ortak/guncelle', { govde: { parola: parola.girdi.value, ...(hedefSurum ? { surum: hedefSurum } : {}) } }));
        baglam.akisAlani.replaceChildren();
        iceAktarmaAkisi(baglam.akisAlani, {
          // Ekip güncellemesi sürümün tamamını alır (önizlemede işaret kaldırılamaz; istenmeyen kayıt sonra silinir / değiştirilir).
          mod: 'ayarlar', baslangicIsId: isId, tamami: true,
          uygulandi: async () => { try { await api('/platform/ortak/alindi', { govde: { surum } }); } catch { /* işaret sonra da konabilir */ } window.dispatchEvent(new Event('ortak-durum-degisti')); },
          bitti: async () => { await baglam.projeleriYenile(); baglam.gizle(false); baglam.akisAlani.replaceChildren(); baglam.yenile(); },
          vazgec: () => { baglam.akisAlani.replaceChildren(); baglam.gizle(false); }
        });
      } catch (hata) { m.goster(hata.message); }
    });
    baglam.gizle(true);
    baglam.akisAlani.replaceChildren(form);
    parola.girdi.focus();
  }

  /**
   * Birleştir ve yayınla: parola → son sürüm hazırlanır → üçlü karşılaştırma → kararlar → uygula + yayınla.
   * @param {string} notMetni
   */
  function birlestirmeFormu(notMetni) {
    const isiAt = (/** @type {string | null} */ isId) => { if (isId) void api(`/platform/yedek/ice-aktar/${isId}/iptal`, { govde: {} }).catch(() => {}); };
    const kapat = (/** @type {string | null} */ isId) => { isiAt(isId); baglam.akisAlani.replaceChildren(); baglam.gizle(false); };
    const parola = parolaAlani('Ekibin ortak kasa parolası', { zorunlu: true, otomatik: 'current-password' });
    const m = mesajKutusu();
    const git = h('button', { type: 'submit', class: 'birincil' }, 'Karşılaştır');
    const form = h('form', { class: 'kart', novalidate: true },
      h('h3', {}, ikon('uyari'), `Çakışma var: v${ortak.sonSurum} sizde yok`),
      h('p', { class: 'soluk' }, `Siz en son ${ortak.benimSurum ? `v${ortak.benimSurum}` : 'hiçbir sürümü'} aldınız; o zamandan beri ekip v${ortak.sonSurum} yayınladı. Onun yaptıklarını görüp hangilerini dahil edeceğinizi seçersiniz; sizin değişiklikleriniz olduğu gibi kalır. Sonra birleşmiş hâl yeni sürüm olarak yayınlanır.`),
      m.kutu, parola.kapsayici,
      h('div', { class: 'dugmeler' }, git, h('button', { type: 'button', class: 'hayalet', onclick: () => kapat(null) }, 'Vazgeç')));
    form.addEventListener('submit', async (olay) => {
      olay.preventDefault();
      if (!parola.girdi.value) { m.goster('Kasa parolasını girin.'); return; }
      /** @type {string | null} */
      let isId = null;
      try {
        const f = await mesgulIken(git, 'Karşılaştırılıyor…', async () => {
          const g = await api('/platform/ortak/guncelle', { govde: { parola: parola.girdi.value } });
          isId = g.isId;
          for (;;) {
            const { is } = await api(`/platform/yedek/ice-aktar/${isId}`).catch((e) => ({ is: { durum: 'hata', mesaj: e.message } }));
            if (is.durum === 'hazir') break;
            if (is.durum !== 'hazirlaniyor') throw new Error(is.mesaj || 'Son sürüm hazırlanamadı.');
            await new Promise((c) => setTimeout(c, 400));
          }
          return api('/platform/ortak/birlestir/fark', { govde: { isId, parola: parola.girdi.value, surum: g.surum } });
        });
        const id = /** @type {string} */ (/** @type {unknown} */ (isId));
        kararEkrani(id, f, notMetni, () => kapat(id));
      } catch (hata) { m.goster(hata.message); isiAt(isId); }
    });
    baglam.gizle(true);
    baglam.akisAlani.replaceChildren(form);
    parola.girdi.focus();
  }

  /**
   * Onun değişiklikleri: yeni / değişen (dahil et, varsayılan işaretli), çakışma (onunki / benimki, seçim zorunlu), onda silinen (bilgi).
   * @param {string} isId @param {{ farklar: Array<Record<string, any>>; sonSurum: number; tabanYok: boolean }} f @param {string} notMetni @param {() => void} vazgec
   */
  function kararEkrani(isId, f, notMetni, vazgec) {
    const kararlar = new Map();
    const anahtar = (/** @type {Record<string, any>} */ x) => `${x.tablo}:${x.id}`;
    const ad = (/** @type {Record<string, any>} */ x) => `${x.etiket} › ${x.baslik}`;
    const alanlar = (/** @type {Record<string, any>} */ x) => (x.alanlar && x.alanlar.length ? h('small', { class: 'soluk blok' }, `Değişen: ${x.alanlar.slice(0, 6).join(', ')}${x.alanlar.length > 6 ? ' …' : ''}`) : null);
    const onun = f.farklar.filter((x) => x.tur === 'yeni' || x.tur === 'degisti');
    const cakisan = f.farklar.filter((x) => x.tur === 'cakisma');
    const silinen = f.farklar.filter((x) => x.tur === 'silindi');
    const onunSatiri = (/** @type {Record<string, any>} */ x) => {
      const kutu = h('input', { type: 'checkbox', checked: true, 'aria-label': `Dahil et: ${ad(x)}` });
      kutu.addEventListener('change', () => kararlar.set(anahtar(x), kutu.checked ? 'dahil' : 'haric'));
      return h('li', {}, h('label', { class: 'secenek' }, kutu, h('span', {}, h('b', {}, x.tur === 'yeni' ? 'Eklendi: ' : 'Değişti: '), ad(x), alanlar(x))));
    };
    const cakismaSatiri = (/** @type {Record<string, any>} */ x) => {
      const grup = `cakisma-${x.tablo}-${x.id}`;
      const secim = (/** @type {string} */ deger, /** @type {string} */ metin) => {
        const r = h('input', { type: 'radio', name: grup, value: deger, 'aria-label': `${metin}: ${ad(x)}` });
        r.addEventListener('change', () => kararlar.set(anahtar(x), deger));
        return h('label', { class: 'secenek' }, r, metin);
      };
      return h('li', {}, h('div', {}, h('b', {}, x.benSildim ? 'Siz sildiniz, o değiştirdi: ' : 'İkiniz de değiştirdiniz: '), ad(x), alanlar(x)),
        h('div', { class: 'secenekler-satiri', role: 'radiogroup', 'aria-label': `Karar: ${ad(x)}` }, secim('onunki', 'Onunki'), secim('benimki', 'Benimki')));
    };
    const m = mesajKutusu();
    const notGirdisi = h('input', { type: 'text', maxlength: '250', value: notMetni || '', placeholder: 'Ne değişti? (isteğe bağlı)', 'aria-label': 'Sürüm notu' });
    const uygula = h('button', { type: 'button', class: 'birincil' }, ikon('yukle'), `Birleştir ve yayınla (v${f.sonSurum + 1})`);
    uygula.addEventListener('click', async () => {
      m.temizle();
      const eksik = cakisan.find((x) => !kararlar.has(anahtar(x)));
      if (eksik) { m.goster(`Çakışan kayıt için seçin (Onunki / Benimki): ${ad(eksik)}`); return; }
      try {
        const y = await mesgulIken(uygula, 'Birleştiriliyor…', () => api('/platform/ortak/birlestir/uygula', { govde: { isId, kararlar: Object.fromEntries(kararlar), not: notGirdisi.value } }));
        bildir(`v${y.kayit.surum} yayınlandı (${y.dahil} değişiklik dahil edildi${y.haric ? `, ${y.haric} dahil edilmedi` : ''}).`);
        window.dispatchEvent(new Event('ortak-durum-degisti'));
        await baglam.projeleriYenile();
        baglam.gizle(false); baglam.akisAlani.replaceChildren(); baglam.yenile();
      } catch (hata) { m.goster(hata.message); }
    });
    const bolum = (/** @type {string} */ baslik, /** @type {string} */ aciklama, /** @type {Node[]} */ satirlar) => (satirlar.length
      ? h('section', { class: 'birlestirme-bolumu' }, h('h4', {}, baslik, ' ', h('span', { class: 'rozet' }, String(satirlar.length))), h('p', { class: 'soluk kucuk' }, aciklama), h('ul', { class: 'duz-liste' }, satirlar))
      : null);
    baglam.akisAlani.replaceChildren(h('div', { class: 'kart ortak-birlestirme' },
      h('h3', {}, ikon('uyari'), `v${f.sonSurum} ile birleştir`),
      f.tabanYok ? h('p', { class: 'not-kutusu uyari kucuk', role: 'note' }, 'En son aldığınız sürümün dosyası klasörde yok; bu yüzden farklı olan her kayıt "ikiniz de değiştirdiniz" olarak listelenir.') : null,
      f.farklar.length ? null : h('p', { class: 'not-kutusu bilgi', role: 'status' }, 'Onun değişiklikleri sizinkilerle çakışmıyor; yalnız sizin değişiklikleriniz var.'),
      bolum('Onun yaptıkları', 'İşaretli olanlar sizde de uygulanır. İşaretini kaldırdığınız değişiklik yeni sürüme girmez (onunkinin üzerine yazılır).', onun.map(onunSatiri)),
      bolum('Çakışanlar', 'Aynı kaydı ikiniz de değiştirdiniz: hangisi kalsın?', cakisan.map(cakismaSatiri)),
      bolum('Onda silinenler', 'Bilgi: sizde durur; yayınlarsanız yeni sürümde yine olur. İstemiyorsanız sonra silin.', silinen.map((x) => h('li', {}, ad(x)))),
      m.kutu,
      h('div', { class: 'satir-girdi' }, notGirdisi, uygula),
      h('div', { class: 'dugmeler' }, h('button', { type: 'button', class: 'hayalet', onclick: vazgec }, 'Vazgeç'))));
  }

  const surumSatirlari = ortak.surumler.length
    ? h('ul', { class: 'duz-liste kucuk' }, ortak.surumler.map((s) => {
      const don = h('button', { type: 'button', class: 'hayalet kucuk-dugme', 'aria-label': `v${s.surum} sürümüne dön`, disabled: s.surum === ortak.benimSurum }, 'Bu sürüme dön');
      don.addEventListener('click', () => guncelleFormu(s.surum));
      return h('li', {}, `v${s.surum} · ${s.yapan || '—'} · ${tarihMetni(s.zaman)} · ${boyutMetni(s.bayt)}${s.not ? ` · ${s.not}` : ''}${s.surum === ortak.benimSurum ? ' · sizdeki' : ''} `, don);
    }))
    : null;

  return h('div', { class: 'kart', role: 'group', 'aria-label': 'Ekip paylaşımı' },
    h('h3', {}, ikon('kullanici'), 'Ekip paylaşımı'),
    h('p', { class: 'soluk' }, 'Ekip aynı ortak klasörü (OneDrive / ağ sürücüsü) kullanır: biri "Yayınla" der, diğerleri "Güncelle" ile alır. Her yayın yeni bir sürümdür, eskileri silinmez. Ekip aynı kasa parolasını kullanır. Giriş bilgileri ve entegrasyon gizlileri kişiye özeldir: paylaşılmaz, güncellemede sizinki korunur.'),
    // "Kim yaptı" adı: dosyayı açarken girilen kullanıcı adı (Ayarlar > Ekip); ayrıca yazılmaz.
    h('p', { class: 'kucuk' }, h('b', {}, 'Yayınlarda adınız: '), kullaniciAdi || h('span', { class: 'soluk' }, 'girişte kullanıcı adı yazılmadı (bilgisayar kullanıcı adı kullanılır)')),
    h('div', { class: 'alan' }, h('label', { for: girdi.id || (girdi.id = yeniKimlik('ortak-klasor')) }, 'Ortak klasör'),
      h('div', { class: 'satir-girdi' }, girdi, kaydet),
      h('div', { class: 'yardim' }, 'Boş bırakırsanız paylaşım kapalıdır. Klasörün herkesle paylaşıldığından ve eşitlendiğinden emin olun.')),
    durumKutusu, eylemler, surumSatirlari, mesaj.kutu);
}
