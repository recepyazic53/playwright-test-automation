// EKİP PAYLAŞIMI kartı (Ayarlar > Yedekleme). Sunucu: /platform/ortak/* (ortak-paylasim.mjs).
// Ortak klasör (OneDrive / ağ sürücüsü) seçilir; "Yayınla" yeni sürüm yazar, "Güncelle" son sürümü içe aktarma önizlemesiyle alır.
// Giriş bilgileri ve entegrasyon gizlileri kişiye özeldir: yayına girmez, güncellemede yerel değer korunur.
import { api, bildir, h, ikon, mesajKutusu, mesgulIken, parolaAlani, tarihMetni, boyutMetni, yeniKimlik } from './ortak.js';
import { iceAktarmaAkisi } from './ice-aktarma.js';

/**
 * @param {Record<string, any>} ortak GET /platform/ortak/durum > ortak
 * @param {{ yenile: () => void; projeleriYenile: () => Promise<void>; akisAlani: HTMLElement; gizle: (gizli: boolean) => void }} baglam
 */
export function ortakPaylasimKarti(ortak, kullaniciAdi, baglam) {
  const mesaj = mesajKutusu();
  const adGirdisi = h('input', { type: 'text', autocomplete: 'off', maxlength: '60', value: kullaniciAdi || '', placeholder: 'Örn. Ayşe', 'aria-label': 'Adınız' });
  const adKaydet = h('button', { type: 'button' }, ikon('onay'), 'Kaydet');
  adKaydet.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      await mesgulIken(adKaydet, 'Kaydediliyor…', () => api('/platform/ortak/kullanici-adi', { govde: { ad: adGirdisi.value } }));
      bildir('Adınız kaydedildi.');
    } catch (hata) { mesaj.goster(hata.message); }
  });
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
    durumKutusu = h('p', { class: 'not-kutusu uyari kucuk', role: 'note' }, 'Ortak klasör bulunamadı; OneDrive / ağ klasörünün bu bilgisayarda açık olduğundan emin olun.');
  } else if (ortak.klasor) {
    const son = ortak.surumler[0];
    durumKutusu = ortak.guncelleVar
      ? h('p', { class: 'not-kutusu uyari', role: 'status' }, ikon('uyari'), ` Yeni sürüm var: v${ortak.sonSurum}${son ? ` (${son.yapan || 'bilinmiyor'}, ${tarihMetni(son.zaman)})` : ''}. Sizdeki: ${ortak.benimSurum ? `v${ortak.benimSurum}` : 'hiç alınmadı'}. Yayınlamadan önce güncelleyin.`)
      : h('p', { class: 'not-kutusu kucuk', role: 'status' }, ortak.sonSurum ? `Güncelsiniz (v${ortak.sonSurum}).` : 'Klasörde henüz yayınlanmış sürüm yok.');

    const yayinla = h('button', { type: 'button', disabled: ortak.guncelleVar }, ikon('yukle'), 'Yayınla');
    const not = h('input', { type: 'text', maxlength: '300', placeholder: 'Ne değişti? (isteğe bağlı)', 'aria-label': 'Sürüm notu' });
    yayinla.addEventListener('click', async () => {
      mesaj.temizle();
      try {
        const y = await mesgulIken(yayinla, 'Yayınlanıyor…', () => api('/platform/ortak/yayinla', { govde: { not: not.value } }));
        bildir(`v${y.kayit.surum} yayınlandı.`);
        baglam.yenile();
      } catch (hata) { mesaj.goster(hata.message); }
    });
    const guncelle = h('button', { type: 'button', class: ortak.guncelleVar ? 'birincil' : '', disabled: !ortak.sonSurum }, ikon('indir'), 'Güncelle');
    guncelle.addEventListener('click', () => guncelleFormu());
    if (ortak.geriDonus) durumKutusu = h('p', { class: 'not-kutusu uyari', role: 'status' }, ikon('uyari'), ` Eski bir sürümdesiniz (v${ortak.benimSurum}); klasördeki son sürüm v${ortak.sonSurum}. Yayınlarsanız bu hâliniz yeni sürüm olur.`);
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
          mod: 'ayarlar', baslangicIsId: isId,
          uygulandi: async () => { try { await api('/platform/ortak/alindi', { govde: { surum } }); } catch { /* işaret sonra da konabilir */ } },
          bitti: async () => { await baglam.projeleriYenile(); baglam.gizle(false); baglam.akisAlani.replaceChildren(); baglam.yenile(); },
          vazgec: () => { baglam.akisAlani.replaceChildren(); baglam.gizle(false); }
        });
      } catch (hata) { m.goster(hata.message); }
    });
    baglam.gizle(true);
    baglam.akisAlani.replaceChildren(form);
    parola.girdi.focus();
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
    h('div', { class: 'alan' }, h('label', { for: adGirdisi.id || (adGirdisi.id = yeniKimlik('ortak-ad')) }, 'Adınız'),
      h('div', { class: 'satir-girdi' }, adGirdisi, adKaydet),
      h('div', { class: 'yardim' }, 'Değişiklik geçmişinde ve yayınlarda "kim yaptı" olarak görünür. Bu bilgisayara özeldir; boşsa işletim sistemi kullanıcı adı kullanılır.')),
    h('div', { class: 'alan' }, h('label', { for: girdi.id || (girdi.id = yeniKimlik('ortak-klasor')) }, 'Ortak klasör'),
      h('div', { class: 'satir-girdi' }, girdi, kaydet),
      h('div', { class: 'yardim' }, 'Boş bırakırsanız paylaşım kapalıdır. Klasörün herkesle paylaşıldığından ve eşitlendiğinden emin olun.')),
    durumKutusu, eylemler, surumSatirlari, mesaj.kutu);
}
