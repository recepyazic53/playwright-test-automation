// YEREL FİKSTÜR — JetKOBİ benzeri teklif ekranı (girişsiz; 127.0.0.1). "JetKOBİ (akış)" paketinin
// (projeler/galaksi/jetkobi-akis.mjs) model koşucusuyla uçtan uca denenmesi içindir. Seçiciler ve davranış JetKOBİ
// POM'undakilerle aynıdır: gizli çizimli radyolar, iki parçalı telefon, tipe göre doğum tarihi, CheckIdentity('INSURED' /
// 'CLIENT') bağlantısıyla kimlik sorgusu ve gecikmeli sonuç kutusu, farklı sigorta ettiren bölümü, UAVT sorgusu (#DR "-1"den
// dolar, blockUI perdesi), mal sahibine özel alanlar, jqTransform listeleri (gizli <select> + açma düğmesi + ul li a[index]),
// işçi sayısından dolan yıllık ücret, iştigal tipine göre sonradan yüklenen cinsler, "Standart" → "Teklif hesapla" →
// /jet-satis/jet-kobi/teminatlar, teminatlar → teklif ("Teklif Kaydet" ya da "JetKobi Hızlı Teklif Ekranı" hata penceresi),
// "Teklif Kaydet" → kredi kartı seçeneği → kart formu → ödeme (tarayıcı uyarısı). Şirket sitesine hiçbir istek gitmez.
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

export const KOBI_YOLU = '/jet-satis/jet-kobi/';
export const KOBI_TEMINAT_YOLU = '/jet-satis/jet-kobi/teminatlar';
/** Ödeme sonucu (TEST'te test kartıyla poliçe kesilmez). */
export const KOBI_ODEME_SONUCU = 'Hiçbir poliçe onaylanamadı.';
/** Teklifte bina yangın bedeli 0 olursa fikstürün döndürdüğü iş kuralı hatası. */
export const KOBI_TEKLIF_HATASI = 'Bina yangın bedeli sıfır olamaz.';
/** jqTransform listeleri (fikstürün; gerçek ekranın listeleri TEST'ten okunacak). Metinler listeler arasında tekildir. */
export const KOBI_LISTELERI: Record<string, Array<[string, string]>> = {
  BuildingType: [['1', 'Betonarme bina'], ['2', 'Yığma bina']],
  EmployerLiability: [['10', '100.000 TL (işveren)'], ['20', '250.000 TL (işveren)']],
  ThirdPartyFinancialLiability: [['10', '100.000 TL (3. şahıs)'], ['20', '250.000 TL (3. şahıs)']],
  ConstructionType: [['1', 'Çelik, Betonarme Karkas'], ['2', 'Yığma Kagir']],
  IstigalTipi: [['1', 'Ticaret'], ['2', 'İmalat']],
  TotalFloor: [['1', '1 - 3 Kat'], ['2', '4 - 7 Kat']],
  RiskFloor: [['0', 'Zemin kat'], ['1', 'Birinci kat']],
  RoofType: [['1', 'Betonarme çatı'], ['2', 'Kiremit çatı']],
  PersonalAccident: [['0', 'Ferdi kaza yok'], ['1', 'Ferdi kaza 50.000 TL']]
};
/** İştigal tipine göre sonradan yüklenen cinsler. */
export const KOBI_ISTIGAL_CINSLERI: Record<string, Array<[string, string]>> = {
  '1': [['101', 'Kırtasiye'], ['102', 'Giyim mağazası']],
  '2': [['201', 'Mobilya imalatı'], ['202', 'Gıda imalatı']]
};

export type KobiKaydi = Record<string, unknown>;

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}label{display:block;margin:6px 0}.radyo{position:relative;display:inline-block;margin-right:12px}
.radyo input{position:absolute;opacity:0;width:14px;height:14px;margin:0}.radyo span{padding-left:18px}
.jqTransformSelectWrapper{display:inline-block;position:relative;min-width:220px;border:1px solid #999;margin:4px 0}
.jqTransformSelectWrapper>div{display:flex;justify-content:space-between;padding:2px 6px}
.jqTransformSelectWrapper a.jqTransformSelectOpen{display:inline-block;width:18px;text-align:center;text-decoration:none}
.jqTransformSelectWrapper ul{list-style:none;margin:0;padding:0;border-top:1px solid #999}.jqTransformSelectWrapper ul a{display:block;padding:2px 6px}
.blockUI.blockOverlay{position:fixed;inset:0;background:rgba(0,0,0,.2);z-index:1000}</style></head><body>${govde}</body></html>`
});
const json = (veri: unknown): FiksturYaniti => ({ tur: 'application/json', govde: JSON.stringify(veri) });

/** jqTransform benzeri liste betiği (her iki sayfada ortak). */
const JQ_BETIGI = `
  const jqKur = (select) => {
    let s = select.parentElement;
    if (!s || !s.classList.contains('jqTransformSelectWrapper')) {
      s = document.createElement('div'); s.className = 'jqTransformSelectWrapper';
      select.parentElement.insertBefore(s, select); s.appendChild(select); select.hidden = true;
    }
    s.querySelectorAll(':scope > div, :scope > ul').forEach((e) => e.remove());
    const baslik = document.createElement('div');
    baslik.innerHTML = '<span></span><a href="#" class="jqTransformSelectOpen">▼</a>';
    baslik.querySelector('span').textContent = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
    const ul = document.createElement('ul'); ul.hidden = true;
    Array.from(select.options).forEach((o, i) => {
      const li = document.createElement('li'); const a = document.createElement('a');
      a.href = '#'; a.setAttribute('index', String(i)); a.textContent = o.text;
      a.onclick = (e) => { e.preventDefault(); select.selectedIndex = i; baslik.querySelector('span').textContent = o.text; ul.hidden = true;
        select.dispatchEvent(new Event('change', { bubbles: true })); };
      li.appendChild(a); ul.appendChild(li);
    });
    baslik.querySelector('a').onclick = (e) => { e.preventDefault(); ul.hidden = !ul.hidden; };
    s.insertBefore(ul, select); s.insertBefore(baslik, ul);
  };
  document.querySelectorAll('select.jq').forEach(jqKur);`;

export class KobiUygulamasi {
  /** "Standart" ile gönderilen birinci sayfa. */
  readonly standartlar: KobiKaydi[] = [];
  /** Teminat ekranından gönderilen teklifler. */
  readonly teklifler: KobiKaydi[] = [];
  readonly kimlikSorgulari: KobiKaydi[] = [];
  readonly odemeler: KobiKaydi[] = [];
  readonly olaylar: string[] = [];

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.olaylar.push(`${i.yontem} ${i.yol}`);
    if (i.yol === KOBI_YOLU || i.yol === KOBI_YOLU.slice(0, -1)) return this.birinciSayfa();
    if (i.yol === KOBI_TEMINAT_YOLU) return this.teminatSayfasi();
    if (i.yol === '/kobi/kimlik') {
      const kayit = Object.fromEntries(i.sorgu.entries());
      this.kimlikSorgulari.push(kayit);
      // Telefon (iki parça) ve kimlik no olmadan sorgu reddedilir.
      if (!kayit.no || !kayit.kod || !kayit.tel) return json({ Status: false, Data: 'Telefon ve kimlik no zorunludur.' });
      return json({ Status: true, Data: kayit.tip === 'T' ? `UNVAN ${kayit.no.slice(-3)} A.Ş.` : `KİŞİ ${kayit.no.slice(-3)}` });
    }
    if (i.yol === '/kobi/uavt') return json({ Status: true, Data: i.sorgu.get('ak') ?? '' });
    if (i.yol === '/kobi/istigal') return json(KOBI_ISTIGAL_CINSLERI[i.sorgu.get('tip') ?? ''] ?? []);
    if (i.yol === '/jet-satis/jet-kobi/standart' && i.yontem === 'POST') {
      this.standartlar.push(JSON.parse(i.govde || '{}') as KobiKaydi);
      return json({ Status: true });
    }
    if (i.yol === '/jet-satis/jet-kobi/teklif' && i.yontem === 'POST') {
      const g = JSON.parse(i.govde || '{}') as KobiKaydi;
      this.teklifler.push(g);
      if (!g.C1000 || Number(g.C1000) === 0) return json({ Status: false, Data: KOBI_TEKLIF_HATASI });
      return json({ Status: true, Data: { prim: '1.234,56' } });
    }
    if (i.yol === '/kobi/odeme' && i.yontem === 'POST') {
      this.odemeler.push(JSON.parse(i.govde || '{}') as KobiKaydi);
      return json({ mesaj: KOBI_ODEME_SONUCU });
    }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };

  private birinciSayfa(): FiksturYaniti {
    const radyo = (ad: string, deger: string, metin: string, secili = false) =>
      `<label class="radyo"><input type="radio" name="${ad}" id="${ad}-${deger}" value="${deger}"${secili ? ' checked' : ''}><span>${metin}</span></label>`;
    const liste = (id: string, etiket: string) =>
      `<label>${etiket}</label><select class="jq" id="${id}"><option value="">Seçiniz</option>${(KOBI_LISTELERI[id] ?? []).map(([d, m]) => `<option value="${d}">${m}</option>`).join('')}</select>`;
    return html('JetKOBİ', `<h1>JetKOBİ</h1>
      <section id="sigortali"><h2>Sigortalı</h2>
        ${radyo('CustomerType', 'O', 'Özel', true)}${radyo('CustomerType', 'T', 'Tüzel')}
        <label>Cep telefonu <input id="TelefonKodu" maxlength="3" size="3"> <input id="Telefonu" maxlength="7"></label>
        <label id="dogum-kutu">Doğum tarihi <input id="BirthDate"></label>
        <label>Kimlik no <input id="IdentityNumber"></label>
        <a href="javascript:CheckIdentity('INSURED')">Sorgula</a>
        <div id="IdentityDetail" hidden><b>Sigortalı</b> <span id="insured-name"></span></div>
        <div class="alert-danger" id="insured-hata"></div>
      </section>
      <section id="ettiren"><h2>Sigorta ettiren</h2>
        ${radyo('DifferentClient', 'H', 'Sigortalı ile aynı')}${radyo('DifferentClient', 'E', 'Farklı')}
        <div id="client-kutu" hidden>
          ${radyo('ClientType', 'O', 'Özel', true)}${radyo('ClientType', 'T', 'Tüzel')}
          <label>Cep telefonu <input id="ClientTelefonKodu" maxlength="3" size="3"> <input id="ClientTelefonu" maxlength="7"></label>
          <label id="client-dogum-kutu">Doğum tarihi <input id="ClientBirthDate"></label>
          <label>Kimlik no <input id="ClientIdentityNumber"></label>
          <a href="javascript:CheckIdentity('CLIENT')">Sorgula</a>
          <div id="ClientIdentityDetail" hidden><b>Sigorta Ettiren</b> <span id="client-name"></span></div>
        </div>
      </section>
      <section id="riziko"><h2>Riziko</h2>
        <label>Adres kodu <input id="AK"></label><button id="RefreshUAVT" type="button">Adres sorgula</button>
        <label>Adres <input id="DR" value="-1" readonly></label>
        <label>Başlangıç <input id="BeginDate" readonly></label>
        ${radyo('IsOwner', 'E', 'Mal sahibi')}${radyo('IsOwner', 'H', 'Kiracı')}
        <div id="mal-sahibi-kutu" hidden>
          ${liste('BuildingType', 'Bina tipi')}
          <label>Brüt m² <input id="GrossAreaM2"></label>
          ${radyo('IsDASKDepended', 'E', 'DASK\'a bağlı')}${radyo('IsDASKDepended', 'H', 'DASK\'a bağlı değil', true)}
        </div>
        ${radyo('IsHaveLossPayee', 'E', 'Dain-i mürtehin var', true)}${radyo('IsHaveLossPayee', 'H', 'Yok')}
        <label>İşçi sayısı <input id="numberOfWorkers" value="0"></label>
        <label>Yıllık brüt işçilik ücreti <input id="YearLaborWage" readonly></label>
        ${liste('EmployerLiability', 'İşveren mali mesuliyeti')}${liste('ThirdPartyFinancialLiability', 'Üçüncü şahıs mali mesuliyeti')}
        ${liste('ConstructionType', 'Yapı tarzı')}${liste('IstigalTipi', 'İştigal tipi')}
        <label>İştigal cinsi</label><select class="jq" id="IstigalCinsi"><option value="">Seçiniz</option></select>
        ${liste('TotalFloor', 'Toplam kat')}${liste('RiskFloor', 'Rizikonun bulunduğu kat')}${liste('RoofType', 'Çatı tipi')}
        <label>Bina inşa yılı <input id="BuildYear"></label>
        ${liste('PersonalAccident', 'Ferdi kaza teminatı')}
      </section>
      <p><button id="btnStandart" type="button">Standart</button> <button id="TeklifHesaplaButon" type="button" hidden>Teklif hesapla</button></p>
      <script>
        ${JQ_BETIGI}
        const $ = (id) => document.getElementById(id);
        const secili = (ad) => { const r = document.querySelector('input[name=' + ad + ']:checked'); return r ? r.value : null; };
        const guncelle = () => {
          $('dogum-kutu').hidden = secili('CustomerType') === 'T';
          $('client-kutu').hidden = secili('DifferentClient') !== 'E';
          $('client-dogum-kutu').hidden = secili('ClientType') === 'T';
          $('mal-sahibi-kutu').hidden = secili('IsOwner') !== 'E';
        };
        document.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', guncelle));
        guncelle();
        // Kimlik sorgusu: sonuç ~600 ms sonra; başarılıysa sonuç kutusu görünür (başlık + ad), değilse hata uyarısı.
        window.CheckIdentity = async (kim) => {
          const c = kim === 'CLIENT';
          const p = c ? 'Client' : '';
          const tip = c ? secili('ClientType') : secili('CustomerType');
          const q = new URLSearchParams({ kim, tip, kod: $(p + 'TelefonKodu').value, tel: $(p + 'Telefonu').value,
            dogum: tip === 'T' ? '' : $(p + 'BirthDate').value, no: $(p + 'IdentityNumber').value });
          const r = await (await fetch('/kobi/kimlik?' + q)).json();
          setTimeout(() => {
            if (!r.Status) { $('insured-hata').textContent = r.Data; return; }
            $(c ? 'client-name' : 'insured-name').textContent = r.Data;
            $(p + 'IdentityDetail').hidden = false;
          }, 600);
        };
        // UAVT: blockUI perdesi 700 ms, #DR 400 ms sonra dolar.
        $('RefreshUAVT').onclick = async () => {
          const perde = document.createElement('div'); perde.className = 'blockUI blockOverlay'; document.body.appendChild(perde);
          const r = await (await fetch('/kobi/uavt?ak=' + encodeURIComponent($('AK').value))).json();
          setTimeout(() => { $('DR').value = r.Data; }, 400);
          setTimeout(() => perde.remove(), 700);
        };
        $('numberOfWorkers').addEventListener('change', () => {
          const n = Number($('numberOfWorkers').value);
          $('YearLaborWage').value = '';
          setTimeout(() => { $('YearLaborWage').value = n > 0 ? String(n * 250000) : ''; }, 300);
        });
        $('IstigalTipi').addEventListener('change', async () => {
          const cins = $('IstigalCinsi');
          cins.innerHTML = '<option value="">Seçiniz</option>'; jqKur(cins);
          const liste = await (await fetch('/kobi/istigal?tip=' + $('IstigalTipi').value)).json();
          setTimeout(() => { liste.forEach(([d, m]) => cins.add(new Option(m, d))); jqKur(cins); }, 500);
        });
        $('btnStandart').onclick = async () => {
          const d = (id) => $(id).value;
          const govde = { tip: secili('CustomerType'), kod: d('TelefonKodu'), tel: d('Telefonu'), dogum: secili('CustomerType') === 'T' ? null : d('BirthDate'),
            no: d('IdentityNumber'), ad: $('insured-name').textContent, farkli: secili('DifferentClient'),
            ettiren: secili('DifferentClient') === 'E' ? { tip: secili('ClientType'), kod: d('ClientTelefonKodu'), tel: d('ClientTelefonu'),
              dogum: secili('ClientType') === 'T' ? null : d('ClientBirthDate'), no: d('ClientIdentityNumber'), ad: $('client-name').textContent } : null,
            ak: d('AK'), dr: d('DR'), baslangic: d('BeginDate'), malSahibi: secili('IsOwner'),
            bina: secili('IsOwner') === 'E' ? { tip: d('BuildingType'), alan: d('GrossAreaM2'), dask: secili('IsDASKDepended') } : null,
            dainiMurtehin: secili('IsHaveLossPayee'), isci: d('numberOfWorkers'), ucret: d('YearLaborWage'), isveren: d('EmployerLiability'),
            ucuncu: d('ThirdPartyFinancialLiability'), yapi: d('ConstructionType'), istigalTipi: d('IstigalTipi'), istigalCinsi: d('IstigalCinsi'),
            toplamKat: d('TotalFloor'), kat: d('RiskFloor'), cati: d('RoofType'), insaYili: d('BuildYear'), ferdiKaza: d('PersonalAccident') };
          await fetch('/jet-satis/jet-kobi/standart', { method: 'POST', body: JSON.stringify(govde) });
          setTimeout(() => { $('TeklifHesaplaButon').hidden = false; }, 300);
        };
        $('TeklifHesaplaButon').onclick = () => { setTimeout(() => location.assign('/jet-satis/jet-kobi/teminatlar'), 200); };
      </script>`);
  }

  private teminatSayfasi(): FiksturYaniti {
    const kodlar = ['C1000', 'C1225', 'C1230', 'C1116', 'C1117', 'C1118', 'C1089', 'C3180', 'C1119', 'C1147', 'C1036'];
    return html('JetKOBİ teminatlar', `<h1>Teminatlar</h1>
      ${kodlar.map((k) => `<label>${k} <input id="${k}" value="0"></label>`).join('')}
      <label>Yangın ve güvenlik önlemleri <input id="FireAndTheftPrecautionsinRisk"></label>
      <p><button id="TeklifHesaplaButon" type="button">Teklif hesapla</button> <span id="prim"></span>
        <button id="TeklifKaydetButon" type="button" hidden>Teklif Kaydet</button></p>
      <div class="ui-dialog" id="teklif-hatasi" hidden><div class="ui-dialog-titlebar"><span>JetKobi Hızlı Teklif Ekranı</span></div>
        <div class="ui-dialog-content" id="teklif-hata-metni"></div></div>
      <div id="fancybox-wrap" hidden><a href="#" id="kart-baglantisi">KREDİ KARTI İLE POLİÇELEŞTİR</a></div>
      <div id="kart-formu" hidden>
        <label>Kart üzerindeki isim <input id="isim"></label><label>Kart üzerindeki soyisim <input id="soyisim"></label>
        <label>Kart numarası <input id="kartno"></label><label>Güvenlik kodu (CVV) <input id="cvv"></label>
        <label>Ay <select id="ay">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></label>
        <label>Yıl <select id="yil">${Array.from({ length: 11 }, (_, i) => `<option value="${2026 + i}">${2026 + i}</option>`).join('')}</select></label>
        <a href="#" id="odemeyi-tamamla">Ödemeyi tamamla</a>
      </div>
      <script>
        const $ = (id) => document.getElementById(id);
        $('TeklifHesaplaButon').onclick = async () => {
          const govde = Object.fromEntries(${JSON.stringify(kodlar)}.map((k) => [k, $(k).value]));
          govde.onlemler = $('FireAndTheftPrecautionsinRisk').value;
          const r = await (await fetch('/jet-satis/jet-kobi/teklif', { method: 'POST', body: JSON.stringify(govde) })).json();
          await new Promise((c) => setTimeout(c, 300));
          if (!r.Status) { $('teklif-hata-metni').textContent = r.Data; $('teklif-hatasi').hidden = false; return; }
          $('prim').textContent = 'Prim: ' + r.Data.prim; $('TeklifKaydetButon').hidden = false;
        };
        $('TeklifKaydetButon').onclick = () => { setTimeout(() => { $('fancybox-wrap').hidden = false; }, 150); };
        $('kart-baglantisi').onclick = (o) => { o.preventDefault(); $('fancybox-wrap').hidden = true; $('kart-formu').hidden = false; };
        $('odemeyi-tamamla').onclick = async (o) => {
          o.preventDefault();
          const govde = { isim: $('isim').value, soyisim: $('soyisim').value, kartNo: $('kartno').value, cvv: $('cvv').value, ay: $('ay').value, yil: $('yil').value };
          const r = await (await fetch('/kobi/odeme', { method: 'POST', body: JSON.stringify(govde) })).json();
          setTimeout(() => alert(r.mesaj), 200);
        };
      </script>`);
  }
}
