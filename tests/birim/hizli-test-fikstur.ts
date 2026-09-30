// HIZLI TEST SİHİRBAZI TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Çok aşamalı sahte başvuru formu 127.0.0.1'de geçici bir http sunucusunda
// (giris-fikstur.ts > yerelSunucu) çalışır; tüm metinler ve değerler UYDURMADIR, hiçbir gerçek siteye bağlanılmaz.
//
//   /basvuru/        giriş gerektirmez. Alanlar: Ad soyad (zorunlu), Kanal (sayfada hazır: Web seçili, sorulmaz), Müşteri tipi (zorunlu; Kurumsal seçilince zorunlu "Vergi no" belirir).
//                    "Hesapla" (form dışında, type=button): Ad soyad boşsa hata kutusu "Zorunlu alan: Ad soyad"; doluysa "Hesaplanıyor…"
//                    göstergesi + GET /api/hesapla (sunucu gecikmeli) → "Tutar: 1.250,00 TL" + yeni alan "Ödeme şekli" (HTML'de zorunlu işaretsiz; sayfa kendisi denetler) + "Onayla".
//                    "Onayla": Ödeme şekli boşsa "Zorunlu alan: Ödeme şekli"; doluysa "Gönderiliyor…" + POST /api/onayla → "Başvurunuz alındı."
//                    Ayrıca "Temizle" (reset) ve "Geri" düğmeleri (birden çok aday için).
//   kip (testin değiştirdiği): 'normal' | 'hata' (onayla sunucu doğrulaması → "Zorunlu alan: Ödeme şekli (sunucu)") | 'sessiz' (onayla sonuç göstermez).
//   Sayaçlar: hesaplamalar (GET /api/hesapla), onaylar (POST /api/onayla) — düğmeye basıldığının / basılmadığının kanıtı.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0 2px}.gizli{display:none}.alert-danger{color:#b00}.alert-success{color:#060}</style></head><body>${govde}</body></html>`
});

export const HIZLI_BASVURU_SAYFASI = `<h1>Başvuru</h1>
<p>Bilgileri doldurup tutarı hesaplayın.</p>
<div id="form">
  <label for="adSoyad">Ad soyad</label><input id="adSoyad" name="adSoyad" required>
  <label for="musteriTipi">Müşteri tipi</label>
  <select id="musteriTipi" name="musteriTipi" required><option value="">Seçin</option><option value="bireysel">Bireysel</option><option value="kurumsal">Kurumsal</option></select>
  <label for="kanal">Kanal</label>
  <select id="kanal" name="kanal"><option value="web" selected>Web</option><option value="sube">Şube</option></select>
  <div id="vergiKutusu" class="gizli"><label for="vergiNo">Vergi no</label><input id="vergiNo" name="vergiNo" required></div>
</div>
<p><button type="button" id="hesapla">Hesapla</button> <button type="button" id="temizle" onclick="document.getElementById('adSoyad').value=''">Temizle</button>
<button type="button" id="geri" onclick="history.back()">Geri</button></p>
<div id="uyari" class="alert alert-danger" role="alert" hidden></div>
<span id="bekleme" class="spinner-border" hidden>Hesaplanıyor…</span>
<div id="sonuc" hidden>
  <p id="tutar"></p>
  <label for="odemeSekli">Ödeme şekli</label>
  <select id="odemeSekli" name="odemeSekli"><option value="">Seçin</option><option value="kart">Kredi kartı</option><option value="havale">Havale</option></select>
  <p><button type="button" id="onayla">Onayla</button></p>
  <span id="gonderiliyor" class="spinner-border" hidden>Gönderiliyor…</span>
</div>
<div id="tamam" class="alert alert-success" role="status" hidden></div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  // Alandan çıkınca gelen sayfa doğrulaması (ör. geçersiz değer): doldurma sırasında hata mesajı belirir.
  $('adSoyad').addEventListener('change', function () { if (this.value === 'HATALI') uyar('Zorunlu alan: Ad soyad geçersiz'); });
  $('musteriTipi').addEventListener('change', function () { $('vergiKutusu').className = this.value === 'kurumsal' ? '' : 'gizli'; });
  function uyar(m) { $('uyari').textContent = m; $('uyari').hidden = false; }
  $('hesapla').addEventListener('click', function () {
    $('uyari').hidden = true;
    if (!$('adSoyad').value) { uyar('Zorunlu alan: Ad soyad'); return; }
    $('bekleme').hidden = false;
    fetch('/api/hesapla?tip=' + encodeURIComponent($('musteriTipi').value) + '&vergi=' + encodeURIComponent($('vergiNo').value))
      .then(function (r) { return r.json(); }).then(function (j) {
        $('bekleme').hidden = true;
        $('tutar').textContent = 'Tutar: ' + j.tutar + ' TL';
        $('sonuc').hidden = false;
      });
  });
  $('onayla').addEventListener('click', function () {
    $('uyari').hidden = true;
    if (!$('odemeSekli').value) { uyar('Zorunlu alan: Ödeme şekli'); return; }
    $('gonderiliyor').hidden = false;
    fetch('/api/onayla', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ odeme: $('odemeSekli').value }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        $('gonderiliyor').hidden = true;
        if (j.hata) { uyar(j.hata); return; }
        if (j.sessiz) return;
        $('tamam').textContent = 'Başvurunuz alındı. Başvuru no: ' + j.no;
        $('tamam').hidden = false;
      });
  });
</script>`;

export class HizliTestUygulamasi {
  readonly istekler: string[] = [];
  readonly hesaplamalar: Array<{ tip: string; vergi: string }> = [];
  readonly onaylar: string[] = [];
  kip: 'normal' | 'hata' | 'sessiz' = 'normal';
  private no = 4700;

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/basvuru/' && i.yontem === 'GET') return html('Başvuru', HIZLI_BASVURU_SAYFASI);
    if (i.yol === '/api/hesapla' && i.yontem === 'GET') {
      this.hesaplamalar.push({ tip: i.sorgu.get('tip') ?? '', vergi: i.sorgu.get('vergi') ?? '' });
      return { tur: 'application/json', govde: JSON.stringify({ tutar: i.sorgu.get('tip') === 'kurumsal' ? '2.500,00' : '1.250,00' }), gecikmeMs: 1_200 };
    }
    if (i.yol === '/api/onayla' && i.yontem === 'POST') {
      this.onaylar.push(i.govde);
      if (this.kip === 'hata') return { tur: 'application/json', govde: JSON.stringify({ hata: 'Zorunlu alan: Ödeme şekli (sunucu)' }), gecikmeMs: 400 };
      if (this.kip === 'sessiz') return { tur: 'application/json', govde: JSON.stringify({ sessiz: true }), gecikmeMs: 400 };
      return { tur: 'application/json', govde: JSON.stringify({ no: ++this.no }), gecikmeMs: 800 };
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}
