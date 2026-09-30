// EYLEM VE DOĞRULAMA KEŞFİ TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Uygulama 127.0.0.1'de geçici bir http sunucusunda
// (giris-fikstur.ts > yerelSunucu) çalışır; tüm metinler SAHTEDİR, hiçbir gerçek siteye bağlanılmaz.
//
//   /basvuru/     giriş gerektirmeyen başvuru formu: form içinde type=submit "Gönder" (action=/tesekkurler, POST) ve "Temizle"
//                 (reset); alanların altında 4 gizli .invalid-feedback (biri aria-describedby ile alana bağlı), aria-invalid;
//                 form DIŞINDA onclick'li "Hesapla" (GET /hesapla) ve "Geri"; gizli .spinner-border "Hesaplanıyor…"; gizli
//                 .alert-success "Başvurunuz alındı."; eylem metinli bağlantı "Devam et" (/devam/adim-2) ve "Yardım".
//                 Sayfanın kendi sayaçları: window.__tiklamalar (her tıklama), window.__gonderimler (her form gönderimi).
//   /hesapla      GET; hesaplama sayacı artar (düğmeye basıldığının kanıtı)
//   /tesekkurler  POST; gönderim sayacı artar (form gönderildiğinin kanıtı)
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0 2px}.invalid-feedback{display:none;color:#b00}</style></head><body>${govde}</body></html>`
});

export const BASVURU_SAYFASI = `<h1>Başvuru</h1>
<p>Bilgilerinizi doldurun.</p>
<form id="basvuruFormu" method="post" action="/tesekkurler">
  <label for="ad">Ad soyad</label><input id="ad" name="ad" required aria-describedby="adHata">
  <div id="adHata" class="invalid-feedback">Ad soyad zorunlu</div>
  <label for="eposta">E-posta</label><input id="eposta" name="eposta" type="email" aria-invalid="false">
  <div class="invalid-feedback">Geçerli bir e-posta yazın</div>
  <label for="tel">Telefon</label><input id="tel" name="tel">
  <div class="invalid-feedback">Telefon zorunlu</div>
  <label for="aciklama">Açıklama</label><textarea id="aciklama" name="aciklama"></textarea>
  <div class="invalid-feedback">Açıklama çok uzun</div>
  <p><button type="reset" id="temizle">Temizle</button> <button type="submit" id="gonder">Gönder</button></p>
</form>
<div class="hesap">
  <button type="button" id="hesapla" onclick="hesapla()">Hesapla</button>
  <span class="spinner-border" id="yukleniyor" role="status" hidden>Hesaplanıyor…</span>
  <button type="button" onclick="history.back()">Geri</button>
</div>
<div id="basvuruSonucu" class="alert alert-success" role="status" hidden>Başvurunuz alındı.</div>
<p><a href="/devam/adim-2">Devam et</a> · <a href="/yardim">Yardım</a></p>
<script>
  window.__tiklamalar = 0;
  window.__gonderimler = 0;
  document.addEventListener('click', function () { window.__tiklamalar++; }, true);
  document.addEventListener('submit', function () { window.__gonderimler++; }, true);
  function hesapla() {
    document.getElementById('yukleniyor').hidden = false;
    fetch('/hesapla?tutar=1').then(function () { document.getElementById('yukleniyor').hidden = true; });
  }
</script>`;

export class EylemKesfiUygulamasi {
  readonly istekler: string[] = [];
  hesaplamalar = 0;
  gonderimler = 0;

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/basvuru/' && i.yontem === 'GET') return html('Başvuru', BASVURU_SAYFASI);
    if (i.yol === '/hesapla') { this.hesaplamalar++; return { tur: 'application/json', govde: '{"tutar":1}' }; }
    if (i.yol === '/tesekkurler' && i.yontem === 'POST') { this.gonderimler++; return html('Teşekkürler', '<p>Başvurunuz alındı.</p>'); }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}
