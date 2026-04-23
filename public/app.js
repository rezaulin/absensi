function app(){
const token=localStorage.getItem('token');
const user=JSON.parse(localStorage.getItem('user')||'null');
if(!token||!user){window.location.href='/login.html';return{}}
const slug=(()=>{const h=window.location.hostname.split('.');return h.length>=3?h[0]:new URLSearchParams(window.location.search).get('slug')||''})();
const headers={'Content-Type':'application/json','Authorization':'Bearer '+token};
if(slug)headers['X-Tenant-Slug']=slug;
const api=async(url,method='GET',body=null)=>{
const opts={method,headers};
if(body)opts.body=JSON.stringify(body);
const r=await fetch(url,opts);
if(r.status===401){localStorage.clear();window.location.href='/login.html';return null}
return r.json();
};
const apiUpload=async(url,formData)=>{
const h={'Authorization':'Bearer '+token};
if(slug)h['X-Tenant-Slug']=slug;
const r=await fetch(url,{method:'POST',headers:h,body:formData});
if(r.status===401){localStorage.clear();window.location.href='/login.html';return null}
return r.json();
};
return {
user,token,sidebarOpen:false,page:'dashboard',
toast:'',toastType:'success',
items:[],search:'',
modalOpen:false,modalTitle:'',modalFields:[],modalData:{},modalMode:'add',modalEndpoint:'',modalEditId:null,
// Absensi
absenTanggal:new Date().toISOString().slice(0,10),
absenKegiatanId:'',absenKelasId:'',
absenSesiList:[],kegiatanList:[],kelasList:[],kamarList:[],
absenFormOpen:false,absenFormData:[],absenFormSesiId:null,
bulkAbsen:[],
// Rekap
rekapBulan:new Date().getMonth()+1,rekapTahun:new Date().getFullYear(),rekapData:[],
// Settings
settingsData:{},
// Super admin
superStats:[],tenantList:[],
// Dashboard
dashStats:[],
// Import
showImport:false,importLoading:false,importResult:null,
// Detail panel (kamar/kelompok)
detailOpen:false,detailType:'',detailData:null,detailSantri:[],
availableSantri:[],selectedSantriIds:[],loadingDetail:false,
// Kelompok kegiatan filter
kelompokKegiatanFilter:'',

menuItems:[
{id:'dashboard',label:'Dashboard',icon:'📊',roles:['admin','ustadz','wali','superadmin']},
{id:'santri',label:'Santri',icon:'👨‍🎓',roles:['admin','ustadz','wali']},
{id:'kamar',label:'Kamar',icon:'🏠',roles:['admin','ustadz']},
{id:'kelas',label:'Kelas',icon:'🏫',roles:['admin','ustadz']},
{id:'kegiatan',label:'Kegiatan',icon:'📅',roles:['admin']},
{id:'kelompok',label:'Kelompok',icon:'👥',roles:['admin','ustadz']},
{id:'absensi',label:'Absensi Harian',icon:'📋',roles:['admin','ustadz']},
{id:'absen-malam',label:'Absen Malam',icon:'🌙',roles:['admin','ustadz']},
{id:'absen-sekolah',label:'Absen Sekolah',icon:'🏫',roles:['admin','ustadz']},
{id:'pelanggaran',label:'Pelanggaran',icon:'⚠️',roles:['admin','ustadz']},
{id:'prestasi',label:'Prestasi',icon:'🏆',roles:['admin','ustadz']},
{id:'catatan',label:'Catatan Guru',icon:'📝',roles:['admin','ustadz']},
{id:'pengumuman',label:'Pengumuman',icon:'📢',roles:['admin','ustadz','wali']},
{id:'rekap',label:'Rekap',icon:'📊',roles:['admin','ustadz']},
{id:'users',label:'Pengguna',icon:'👤',roles:['admin']},
{id:'settings',label:'Pengaturan',icon:'⚙️',roles:['admin']},
{id:'super-admin',label:'Super Admin',icon:'🔑',roles:['superadmin']},
],

async init(){
this.$watch('page',()=>this.onPageChange());
this.onPageChange();
},

showToast(msg,type='success'){this.toast=msg;this.toastType=type;setTimeout(()=>this.toast='',3000)},
logout(){localStorage.clear();window.location.href='/login.html'},

async onPageChange(){
const p=this.page;
this.detailOpen=false;this.showImport=false;this.importResult=null;
if(p==='dashboard')return this.loadDashboard();
if(p==='santri')return this.loadSantri();
if(p==='absensi')return this.loadAbsensiPage();
if(p==='absen-malam'){await this.loadKamar();return}
if(p==='absen-sekolah'){await this.loadKelasList();return}
if(p==='rekap')return;
if(p==='settings')return this.loadSettings();
if(p==='super-admin')return this.loadSuperAdmin();
if(p==='kelompok'){await this.loadKegiatanList();const d=await api('/api/kelompok');if(d)this.items=d;return}
if(p==='kegiatan'){const d=await api('/api/kegiatan');if(d)this.items=d;return}
// Generic CRUD pages
const endpointMap={kamar:'kamar',kelas:'kelas',pelanggaran:'pelanggaran',prestasi:'prestasi',catatan:'catatan',pengumuman:'pengumuman',users:'users'};
if(endpointMap[p]){const d=await api('/api/'+endpointMap[p]);if(d)this.items=d}
},

async loadDashboard(){
if(this.user.role==='superadmin'){this.page='super-admin';return}
const d=await api('/api/dashboard');
if(!d)return;
this.dashStats=[
{label:'Total Santri',value:d.total_santri||0},
{label:'Total Kamar',value:d.total_kamar||0},
{label:'Total Kelas',value:d.total_kelas||0},
{label:'Absensi Hari Ini',value:d.absensi_hari_ini||0},
{label:'Kegiatan',value:d.total_kegiatan||0},
{label:'Pengguna',value:d.total_users||0},
{label:'Pelanggaran Bulan Ini',value:d.pelanggaran_bulan_ini||0},
{label:'Pengumuman Aktif',value:d.pengumuman_aktif||0}
];
},

async loadSantri(){const d=await api('/api/santri'+(this.search?'?search='+encodeURIComponent(this.search):''));if(d)this.items=d},
async loadKegiatanList(){const d=await api('/api/kegiatan');this.kegiatanList=d||[]},

getDetail(pg,item){
const map={
kamar:`Kapasitas: ${item.kapasitas||'-'}, Santri: ${item.jumlah_santri||0}`,
kelas:`Tingkat: ${item.tingkat||'-'}, Santri: ${item.jumlah_santri||0}`,
kegiatan:`Jenis: ${item.jenis||'-'}, Jam: ${item.jam_mulai||'?'} - ${item.jam_selesai||'?'}`,
kelompok:`Kegiatan: ${item.kegiatan_nama||'-'}, Santri: ${item.jumlah_santri||0}`,
pelanggaran:`Santri: ${item.santri_nama||'-'}, Poin: ${item.poin||0}, Tgl: ${item.tanggal||'-'}`,
prestasi:`Santri: ${item.santri_nama||'-'}, Poin: ${item.poin||0}, Tgl: ${item.tanggal||'-'}`,
catatan:`Santri: ${item.santri_nama||'-'}, Kategori: ${item.kategori||'-'}`,
pengumuman:`Target: ${item.target||'-'}, Prioritas: ${item.prioritas||'-'}`,
users:`Role: ${item.role||'-'}, Status: ${item.status||'-'}`
};
return map[pg]||'';
},

getFields(pg){
const santriFields=[
{name:'nama',label:'Nama',required:true},
{name:'nis',label:'NIS'},
{name:'jenis_kelamin',label:'Jenis Kelamin',type:'select',options:[{value:'',label:'-- Pilih --'},{value:'L',label:'Laki-laki'},{value:'P',label:'Perempuan'}]},
{name:'kamar_id',label:'Kamar',type:'select',options:[{value:'',label:'-- Pilih Kamar --'},...(this.kamarList?.map(k=>({value:k.id,label:k.nama}))||[])]},
{name:'kelas_id',label:'Kelas',type:'select',options:[{value:'',label:'-- Pilih Kelas --'},...(this.kelasList?.map(k=>({value:k.id,label:k.nama}))||[])]},
{name:'tempat_lahir',label:'Tempat Lahir'},
{name:'tanggal_lahir',label:'Tanggal Lahir',type:'date'},
{name:'alamat',label:'Alamat',type:'textarea'},
{name:'nama_ayah',label:'Nama Ayah'},{name:'nama_ibu',label:'Nama Ibu'},{name:'no_hp_wali',label:'No HP Wali'},
{name:'tahun_masuk',label:'Tahun Masuk',type:'number'}
];
const fields={
santri:santriFields,
kamar:[{name:'nama',label:'Nama Kamar',required:true},{name:'kapasitas',label:'Kapasitas',type:'number'},{name:'gedung',label:'Gedung'},{name:'lantai',label:'Lantai'},{name:'keterangan',label:'Keterangan',type:'textarea'}],
kelas:[{name:'nama',label:'Nama Kelas',required:true},{name:'tingkat',label:'Tingkat'}],
kegiatan:[{name:'nama',label:'Nama Kegiatan',required:true},{name:'jenis',label:'Jenis',type:'select',options:[{value:'',label:'-- Pilih Jenis --'},{value:'harian',label:'Harian'},{value:'mingguan',label:'Mingguan'},{value:'bulanan',label:'Bulanan'},{value:'lainnya',label:'Lainnya'}]},{name:'jam_mulai',label:'Jam Mulai',type:'time'},{name:'jam_selesai',label:'Jam Selesai',type:'time'},{name:'keterangan',label:'Keterangan',type:'textarea'}],
kelompok:[{name:'nama',label:'Nama Kelompok',required:true},{name:'kegiatan_id',label:'Kegiatan',type:'select',options:[{value:'',label:'-- Pilih Kegiatan --'},...(this.kegiatanList?.map(k=>({value:k.id,label:k.nama}))||[])]},{name:'keterangan',label:'Keterangan',type:'textarea'}],
pelanggaran:[{name:'santri_id',label:'ID Santri',type:'number',required:true},{name:'jenis',label:'Jenis Pelanggaran',required:true},{name:'poin',label:'Poin',type:'number'},{name:'tanggal',label:'Tanggal',type:'date',required:true},{name:'keterangan',label:'Keterangan',type:'textarea'}],
prestasi:[{name:'santri_id',label:'ID Santri',type:'number',required:true},{name:'jenis',label:'Jenis Prestasi',required:true},{name:'poin',label:'Poin',type:'number'},{name:'tanggal',label:'Tanggal',type:'date',required:true},{name:'keterangan',label:'Keterangan',type:'textarea'}],
catatan:[{name:'santri_id',label:'ID Santri',type:'number',required:true},{name:'judul',label:'Judul',required:true},{name:'isi',label:'Isi',type:'textarea'},{name:'kategori',label:'Kategori',type:'select',options:[{value:'',label:'-- Pilih --'},{value:'akademik',label:'Akademik'},{value:'behavior',label:'Perilaku'},{value:'lainnya',label:'Lainnya'}]},{name:'tanggal',label:'Tanggal',type:'date',required:true}],
pengumuman:[{name:'judul',label:'Judul',required:true},{name:'isi',label:'Isi',type:'textarea',required:true},{name:'target',label:'Target',type:'select',options:[{value:'',label:'-- Pilih --'},{value:'semua',label:'Semua'},{value:'ustadz',label:'Ustadz'},{value:'wali',label:'Wali'},{value:'admin',label:'Admin'}]},{name:'prioritas',label:'Prioritas',type:'select',options:[{value:'',label:'-- Pilih --'},{value:'normal',label:'Normal'},{value:'penting',label:'Penting'},{value:'urgent',label:'Urgent'}]},{name:'tanggal',label:'Tanggal',type:'date',required:true}],
users:[{name:'nama',label:'Nama',required:true},{name:'username',label:'Username',required:true},{name:'password',label:'Password',type:'password'},{name:'role',label:'Role',type:'select',options:[{value:'',label:'-- Pilih --'},{value:'admin',label:'Admin'},{value:'ustadz',label:'Ustadz'},{value:'wali',label:'Wali'}]},{name:'email',label:'Email',type:'email'},{name:'no_hp',label:'No HP'}],
'super-tenant':[{name:'nama',label:'Nama Pesantren',required:true},{name:'slug',label:'Slug (subdomain)',required:true},{name:'admin_nama',label:'Nama Admin',required:true},{name:'admin_username',label:'Username Admin',required:true},{name:'admin_password',label:'Password Admin',type:'password',required:true}]
};
return fields[pg]||[];
},

async openModal(pg,data=null){
if(pg==='santri'){await this.loadKamar();await this.loadKelasList()}
if(pg==='kelompok'){await this.loadKegiatanList()}
const epMap={santri:'santri',kamar:'kamar',kelas:'kelas',kegiatan:'kegiatan',kelompok:'kelompok',pelanggaran:'pelanggaran',prestasi:'prestasi',catatan:'catatan',pengumuman:'pengumuman',users:'users','super-tenant':'super/sekolah'};
this.modalEndpoint='/api/'+(epMap[pg]||pg);
this.modalFields=this.getFields(pg);
this.modalTitle=(data?'Edit ':'Tambah ')+pg.replace('-',' ');
this.modalMode=data?'edit':'add';
this.modalEditId=data?.id||null;
this.modalData={};
if(data){this.modalFields.forEach(f=>{this.modalData[f.name]=data[f.name]!=null?data[f.name]:''})}
else{this.modalFields.forEach(f=>{this.modalData[f.name]=''})}
this.modalOpen=true;
},

editItem(pg,item){this.openModal(pg,item)},

async saveModal(){
try{
// Clean data: convert empty strings to null for nullable fields
const cleanData={...this.modalData};
['kamar_id','kelas_id','kegiatan_id','ustadz_id','jam_mulai','jam_selesai','tanggal_lahir','tahun_masuk'].forEach(f=>{
if(cleanData[f]==='')cleanData[f]=null;
});
let url=this.modalEndpoint;
let method='POST';
if(this.modalMode==='edit'){url+='/'+this.modalEditId;method='PUT'}
const d=await api(url,method,cleanData);
if(d&&(d.success||d.id)){this.showToast(d.message||'Berhasil');this.modalOpen=false;this.onPageChange()}
else{this.showToast(d?.error||'Gagal','error')}
}catch(e){this.showToast('Error: '+e.message,'error')}
},

async deleteItem(pg,id){
if(!confirm('Yakin ingin menghapus?'))return;
const epMap={santri:'santri',kamar:'kamar',kelas:'kelas',kegiatan:'kegiatan',kelompok:'kelompok',pelanggaran:'pelanggaran',prestasi:'prestasi',catatan:'catatan',pengumuman:'pengumuman',users:'users'};
const d=await api('/api/'+(epMap[pg]||pg)+'/'+id,'DELETE');
if(d?.success){this.showToast('Berhasil dihapus');this.onPageChange()}
else{this.showToast(d?.error||'Gagal','error')}
},

// ============ IMPORT EXCEL ============
async handleImportExcel(event){
const file=event.target.files[0];
if(!file)return;
this.importLoading=true;this.importResult=null;
try{
const formData=new FormData();
formData.append('file',file);
const d=await apiUpload('/api/santri/import-excel',formData);
if(d&&d.success){
this.importResult={success:true,message:d.message,imported:d.imported,failed:d.failed,errors:d.errors||[]};
this.showToast(d.message);
this.loadSantri();
}else{
this.importResult={success:false,message:d?.error||'Gagal import'};
this.showToast(d?.error||'Gagal import','error');
}
}catch(e){
this.importResult={success:false,message:'Error: '+e.message};
this.showToast('Error import','error');
}
this.importLoading=false;
event.target.value='';
},

// ============ DETAIL KAMAR ============
async openDetailKamar(item){
this.loadingDetail=true;this.detailType='kamar';this.detailOpen=true;
const d=await api('/api/kamar/'+item.id);
if(d){this.detailData=d;this.detailSantri=d.santri||[]}
this.loadingDetail=false;
},
async loadAvailableSantriKamar(){
if(!this.detailData)return;
const d=await api('/api/kamar/'+this.detailData.id+'/available-santri');
this.availableSantri=d||[];this.selectedSantriIds=[];
},
async assignSantriToKamar(){
if(this.selectedSantriIds.length===0)return this.showToast('Pilih santri','error');
const d=await api('/api/kamar/'+this.detailData.id+'/santri','POST',{santri_ids:this.selectedSantriIds});
if(d?.success){this.showToast(d.message);await this.openDetailKamar(this.detailData);await this.loadAvailableSantriKamar();this.onPageChange()}
else this.showToast(d?.error||'Gagal','error');
},
async removeSantriFromKamar(santriId){
if(!confirm('Hapus santri dari kamar ini?'))return;
const d=await api('/api/kamar/'+this.detailData.id+'/santri/'+santriId,'DELETE');
if(d?.success){this.showToast(d.message);await this.openDetailKamar(this.detailData);this.onPageChange()}
else this.showToast(d?.error||'Gagal','error');
},

// ============ DETAIL KELOMPOK ============
async openDetailKelompok(item){
this.loadingDetail=true;this.detailType='kelompok';this.detailOpen=true;
const d=await api('/api/kelompok/'+item.id);
if(d){this.detailData=d;this.detailSantri=d.santri||[]}
this.loadingDetail=false;
},
async loadAvailableSantriKelompok(){
const d=await api('/api/santri?status=aktif');
// Filter out those already in this kelompok
const existingIds=this.detailSantri.map(s=>s.id);
this.availableSantri=(d||[]).filter(s=>!existingIds.includes(s.id));
this.selectedSantriIds=[];
},
async assignSantriToKelompok(){
if(this.selectedSantriIds.length===0)return this.showToast('Pilih santri','error');
const d=await api('/api/kelompok/'+this.detailData.id+'/santri','POST',{santri_ids:this.selectedSantriIds});
if(d?.success){this.showToast(d.message);await this.openDetailKelompok(this.detailData);await this.loadAvailableSantriKelompok();this.onPageChange()}
else this.showToast(d?.error||'Gagal','error');
},
async removeSantriFromKelompok(santriId){
if(!confirm('Hapus santri dari kelompok ini?'))return;
const d=await api('/api/kelompok/'+this.detailData.id+'/santri/'+santriId,'DELETE');
if(d?.success){this.showToast(d.message);await this.openDetailKelompok(this.detailData);this.onPageChange()}
else this.showToast(d?.error||'Gagal','error');
},

// Filtered kelompok items by kegiatan
get filteredKelompok(){
if(!this.kelompokKegiatanFilter)return this.items;
return this.items.filter(k=>String(k.kegiatan_id)===String(this.kelompokKegiatanFilter));
},

// ============ ABSENSI ============
async loadAbsensiPage(){
const[kg]=await Promise.all([api('/api/absensi/kegiatan')]);
this.kegiatanList=kg||[];
await this.loadAbsenSesi();
},
async loadAbsenSesi(){
const d=await api('/api/absensi/sesi?tanggal='+this.absenTanggal);
this.absenSesiList=d||[];
},
async openAbsenSesi(){
if(!this.absenKegiatanId)return this.showToast('Pilih kegiatan','error');
const d=await api('/api/absensi/sesi','POST',{kegiatan_id:this.absenKegiatanId,tanggal:this.absenTanggal});
if(d?.success){this.showToast('Sesi dibuka');this.loadAbsenSesi()}
else this.showToast(d?.error||'Gagal','error');
},
async tutupSesi(id){
const d=await api('/api/absensi/sesi/'+id+'/tutup','PUT');
if(d?.success){this.showToast('Sesi ditutup');this.loadAbsenSesi()}
},
async loadAbsenForm(sesi){
this.absenFormSesiId=sesi.id;
const santriData=await api('/api/santri');
this.absenFormData=(santriData||[]).filter(s=>s.status==='aktif').map(s=>({santri_id:s.id,nama:s.nama,status:'hadir',keterangan:''}));
const existing=await api('/api/absensi/sesi/'+sesi.id);
if(existing?.absensi){existing.absensi.forEach(a=>{const f=this.absenFormData.find(x=>x.santri_id===a.santri_id);if(f)f.status=a.status})}
this.absenFormOpen=true;
},
async saveAbsenSesi(){
const d=await api('/api/absensi/bulk','POST',{sesi_id:this.absenFormSesiId,data:this.absenFormData});
if(d?.success){this.showToast('Absensi disimpan');this.absenFormOpen=false}
else this.showToast(d?.error||'Gagal','error');
},

// ============ ABSEN MALAM / SEKOLAH ============
async loadKamar(){const d=await api('/api/kamar');this.kamarList=d||[]},
async loadKelasList(){const d=await api('/api/kelas');this.kelasList=d||[]},
async loadAbsenMalam(){
const santri=await api('/api/santri?status=aktif');
this.bulkAbsen=(santri||[]).map(s=>({santri_id:s.id,nama:s.nama,status:'hadir',keterangan:''}));
const existing=await api('/api/absen-malam?tanggal='+this.absenTanggal);
if(existing)existing.forEach(a=>{const f=this.bulkAbsen.find(x=>x.santri_id===a.santri_id);if(f)f.status=a.status});
},
async loadAbsenSekolah(){
let url='/api/santri?status=aktif';
if(this.absenKelasId)url+='&kelas_id='+this.absenKelasId;
const santri=await api(url);
this.bulkAbsen=(santri||[]).map(s=>({santri_id:s.id,nama:s.nama,status:'hadir',keterangan:''}));
const existing=await api('/api/absen-sekolah?tanggal='+this.absenTanggal+(this.absenKelasId?'&kelas_id='+this.absenKelasId:''));
if(existing)existing.forEach(a=>{const f=this.bulkAbsen.find(x=>x.santri_id===a.santri_id);if(f)f.status=a.status});
},
async saveAbsenBulk(type){
const endpoint=type==='absen-malam'?'/api/absen-malam':'/api/absen-sekolah';
const body={tanggal:this.absenTanggal,data:this.bulkAbsen};
if(type==='absen-sekolah'&&this.absenKelasId)body.kelas_id=this.absenKelasId;
const d=await api(endpoint,'POST',body);
if(d?.success)this.showToast(d.message||'Berhasil disimpan');
else this.showToast(d?.error||'Gagal','error');
},

// ============ REKAP ============
async loadRekap(){
const d=await api('/api/rekap?bulan='+this.rekapBulan+'&tahun='+this.rekapTahun);
this.rekapData=d||[];
},

// ============ SETTINGS ============
async loadSettings(){const d=await api('/api/settings');if(d)this.settingsData=d},
async saveSettings(){
const d=await api('/api/settings','PUT',this.settingsData);
if(d?.success)this.showToast('Pengaturan disimpan');
else this.showToast(d?.error||'Gagal','error');
},

// ============ SUPER ADMIN ============
async loadSuperAdmin(){
const[stats,tenants]=await Promise.all([api('/api/super/stats'),api('/api/super/sekolah')]);
if(stats)this.superStats=[
{label:'Total Pesantren',value:stats.total_sekolah||0},
{label:'Aktif',value:stats.sekolah_aktif||0},
{label:'Trial',value:stats.sekolah_trial||0},
{label:'Suspend',value:stats.sekolah_suspend||0},
{label:'Total Santri',value:stats.total_santri||0},
{label:'Total Users',value:stats.total_users||0},
{label:'Revenue/Bulan',value:'Rp '+(stats.monthly_revenue||0).toLocaleString('id-ID')},
{label:'',value:''}
];
this.tenantList=tenants||[];
},
async activateTenant(id){
const months=prompt('Aktifkan berapa bulan?','1');
if(!months)return;
const d=await api('/api/super/sekolah/'+id+'/activate','POST',{months:parseInt(months)});
if(d?.success){this.showToast(d.message);this.loadSuperAdmin()}
else this.showToast(d?.error||'Gagal','error');
},
async suspendTenant(id){
if(!confirm('Yakin suspend pesantren ini?'))return;
const d=await api('/api/super/sekolah/'+id+'/suspend','POST');
if(d?.success){this.showToast('Pesantren disuspend');this.loadSuperAdmin()}
}
}}
