// app.js

const App = {
    currentUser: null, // role: 'admin' or 'siswa'
    studentData: null, // data of logged in student
    editingSiswaNis: null,
    activeQuestions: [], // for student taking exam
    currentQuestionIndex: 0,
    studentAnswers: {}, // map of { questionId: answer_value }
    examTimer: null,
    timeRemaining: 0,

    async init() {
        await DB.init();
        this.setupEventListeners();
        this.populateClasses();
        this.startAdminClock();
        
        // Auto check if previously logged in (session mock via sessionStorage)
        const sessionUser = sessionStorage.getItem('cbt_user');
        if (sessionUser === 'admin') {
            this.loginSuccess('admin');
        } else if (sessionUser && sessionUser.startsWith('siswa:')) {
            const nis = sessionUser.split(':')[1];
            DB.findSiswaByNis(nis).then(student => {
                if (student) this.loginSuccess('siswa', student);
            });
        }
    },

    setupEventListeners() {
        // --- Login ---
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('username').value.trim();
            const pass = document.getElementById('password').value;

            if (user === 'admin' && pass === 'admin123') {
                this.loginSuccess('admin');
            } else {
                // Check if siswa
                const student = await DB.findSiswaByNis(user);
                if (student && student.sandi === pass) {
                    this.loginSuccess('siswa', student);
                } else {
                    Swal.fire('Gagal Login', 'Username/NIS atau Sandi salah!', 'error');
                }
            }
        });

        // --- Modals ---
        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('modal-overlay').classList.remove('active');
                document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            });
        });

        // --- Logout ---
        document.getElementById('btn-logout-admin').addEventListener('click', () => this.logout());

        // --- Table Actions Delegation ---
        document.getElementById('table-siswa').addEventListener('click', (e) => {
            const btnEdit = e.target.closest('.btn-edit-siswa');
            if (btnEdit) this.editSiswa(btnEdit.dataset.nis);
            const btnDel = e.target.closest('.btn-delete-siswa');
            if (btnDel) this.deleteSiswa(btnDel.dataset.nis);
        });
        document.getElementById('table-soal').addEventListener('click', (e) => {
            const btnDel = e.target.closest('.btn-delete-soal');
            if (btnDel) this.deleteSoal(btnDel.dataset.id);
        });
        document.getElementById('table-hasil').addEventListener('click', (e) => {
            const btnDel = e.target.closest('.btn-delete-hasil');
            if (btnDel) this.deleteHasil(btnDel.dataset.nis);
        });
        
        // --- Admin Navigation ---
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active-section'));
                el.classList.add('active');
                document.getElementById(`${el.dataset.target}-section`).classList.add('active-section');
                this.refreshAdminSection(el.dataset.target);
            });
        });

        // --- Peserta Section ---
        document.getElementById('filter-kelas').addEventListener('change', () => this.renderTableSiswa());
        document.getElementById('search-siswa').addEventListener('input', () => this.renderTableSiswa());
        
        document.getElementById('btn-add-siswa').addEventListener('click', () => {
            document.getElementById('form-siswa').reset();
            this.editingSiswaNis = null;
            this.showModal('modal-siswa');
        });
        document.getElementById('btn-add-bulk').addEventListener('click', () => {
            document.getElementById('input-bulk-data').value = '';
            this.showModal('modal-bulk');
        });

        document.getElementById('form-siswa').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nis = document.getElementById('input-siswa-nis').value.trim();
            const nama = document.getElementById('input-siswa-nama').value.trim();
            const kelas = document.getElementById('input-siswa-kelas').value;
            const sandi = document.getElementById('input-siswa-sandi').value;
            try {
                if (this.editingSiswaNis) {
                    await DB.updateSiswa(this.editingSiswaNis, nis, nama, kelas, sandi);
                    Swal.fire('Sukses', 'Data Siswa berhasil diperbarui', 'success');
                } else {
                    await DB.addSiswa(nis, nama, kelas, sandi);
                    Swal.fire('Sukses', 'Siswa berhasil ditambahkan', 'success');
                }
                this.editingSiswaNis = null;
                this.closeModal();
                this.renderTableSiswa();
            } catch (err) {
                Swal.fire('Error', err.message, 'error');
            }
        });

        document.getElementById('btn-save-bulk').addEventListener('click', async () => {
            const dataStr = document.getElementById('input-bulk-data').value;
            const lines = dataStr.split('\n').map(l => l.trim()).filter(l => l);
            let count = 0;
            for (let line of lines) {
                const parts = line.split(',');
                if (parts.length >= 4) {
                    try {
                        await DB.addSiswa(parts[0].trim(), parts[1].trim(), parts[2].trim(), parts[3].trim());
                        count++;
                    } catch(e) { console.log('Duplicate bulk: ' + e.message); }
                }
            }
            Swal.fire('Selesai', `${count} Siswa berhasil ditambahkan secara massal.`, 'success');
            this.closeModal();
            this.renderTableSiswa();
        });

        // --- Pengaturan Section ---
        document.getElementById('btn-generate-token').addEventListener('click', () => {
            document.getElementById('setting-token').value = Math.random().toString(36).substring(2, 8).toUpperCase();
        });
        document.getElementById('btn-save-settings').addEventListener('click', async () => {
            await DB.savePengaturan({
                jenisUjian: document.getElementById('setting-jenis-ujian').value,
                tahunAjaran: document.getElementById('setting-tahun-ajaran').value,
                semester: document.getElementById('setting-semester').value,
                mapel: document.getElementById('setting-mapel').value,
                durasi: parseInt(document.getElementById('setting-durasi').value) || 120,
                token: document.getElementById('setting-token').value
            });
            Swal.fire('Tersimpan', 'Pengaturan ujian berhasil disimpan', 'success');
        });
        document.getElementById('btn-start-exam').addEventListener('click', async () => {
            await DB.savePengaturan({ isExamOpen: true });
            this.updateExamStatusUI(true);
            Swal.fire('Ujian Dibuka', 'Peserta sekarang dapat login dan mengerjakan', 'success');
        });
        document.getElementById('btn-stop-exam').addEventListener('click', async () => {
            await DB.savePengaturan({ isExamOpen: false });
            this.updateExamStatusUI(false);
            Swal.fire('Ujian Ditutup', 'Akses login peserta ujian telah ditutup', 'info');
        });
        document.getElementById('btn-reset-all').addEventListener('click', () => {
            Swal.fire({
                title: 'Hapus Semua Data?',
                text: "Semua data Siswa, Soal, Hasil, dan Pengaturan akan dihapus permanen!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Ya, Hapus Semua!'
            }).then((result) => {
                if (result.isConfirmed) {
                    DB.resetAll().then(() => {
                        window.location.reload();
                    });
                }
            });
        });

        // --- Bank Soal Section ---
        document.getElementById('btn-add-soal').addEventListener('click', () => {
            document.getElementById('form-soal').reset();
            document.getElementById('preview-soal-gambar').style.display = 'none';
            this.renderOpsiEditor();
            this.showModal('modal-soal');
        });
        
        document.getElementById('input-soal-tipe').addEventListener('change', () => this.renderOpsiEditor());
        
        document.getElementById('input-soal-gambar').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = document.getElementById('preview-soal-gambar');
                    img.src = e.target.result;
                    img.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('upload-word').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const arrayBuffer = event.target.result;
                    mammoth.extractRawText({arrayBuffer: arrayBuffer})
                        .then(function(result) {
                            const text = result.value; 
                            document.getElementById('input-soal-teks').value = text;
                            App.showModal('modal-soal');
                        })
                        .done();
                };
                reader.readAsArrayBuffer(file);
            }
        });

        document.getElementById('form-soal').addEventListener('submit', async (e) => {
            e.preventDefault();
            const jenisUjian = document.getElementById('input-soal-jenis').value;
            const tahunAjaran = document.getElementById('input-soal-tahun').value;
            const semester = document.getElementById('input-soal-semester').value;
            const tipe = document.getElementById('input-soal-tipe').value;
            const teks = document.getElementById('input-soal-teks').value;
            const imgEl = document.getElementById('preview-soal-gambar');
            const imgData = imgEl.style.display === 'block' ? imgEl.src : null;
            
            const soalObj = { jenisUjian, tahunAjaran, semester, tipe, teks, imgData, opsi: [], jawabanBenar: [] };

            if (tipe === 'PG') {
                ['A','B','C','D'].forEach(o => {
                    soalObj.opsi.push({ label: o, text: document.getElementById(`opsi-${o}`).value });
                });
                soalObj.jawabanBenar.push(document.getElementById('key-pg').value);
            } else if (tipe === 'Kompleks') {
                for (let i=1; i<=5; i++) {
                    const val = document.getElementById(`opsi-kompleks-${i}`).value;
                    if(val) soalObj.opsi.push({ label: `Opsi ${i}`, text: val });
                }
                document.querySelectorAll('.key-kompleks:checked').forEach(cb => {
                    soalObj.jawabanBenar.push(cb.value);
                });
            } else if (tipe === 'BS') {
                soalObj.jawabanBenar.push(document.getElementById('key-bs').value);
            }

            try {
                await DB.addSoal(soalObj);
                Swal.fire('Sukses', 'Soal berhasil disimpan', 'success');
                this.closeModal();
                this.renderTableSoal();
            } catch(e) { Swal.fire('Error', e.message, 'error')}
        });

        // --- Siswa Exam Actions ---
        document.getElementById('btn-submit-token').addEventListener('click', async () => {
            const tk = document.getElementById('input-siswa-token').value;
            const settings = await DB.getPengaturan();
            if (tk === settings.token) {
                this.startExamForStudent();
            } else {
                Swal.fire('Salah', 'Token tidak valid', 'error');
            }
        });

        document.getElementById('btn-next-soal').addEventListener('click', () => {
            if (this.currentQuestionIndex < this.activeQuestions.length - 1) {
                this.showQuestion(this.currentQuestionIndex + 1);
            }
        });
        document.getElementById('btn-prev-soal').addEventListener('click', () => {
            if (this.currentQuestionIndex > 0) {
                this.showQuestion(this.currentQuestionIndex - 1);
            }
        });
        document.getElementById('chk-ragu').addEventListener('change', (e) => {
            // Update ragu flag for navigation grid UI
            const btn = document.querySelector(`.nav-btn[data-idx="${this.currentQuestionIndex}"]`);
            if (e.target.checked) btn.classList.add('doubt');
            else btn.classList.remove('doubt');
        });

        document.getElementById('btn-selesai-ujian').addEventListener('click', () => {
            this.confirmSelesaiUjian();
        });

        // --- Download Hasil ---
        document.getElementById('btn-download-excel').addEventListener('click', () => {
            this.downloadExcel();
        });
    },

    // --- Core Navigation ---
    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
        document.getElementById(viewId).classList.add('active-view');
        
        // render mathjax if needed
        if (window.MathJax) {
            MathJax.typesetPromise();
        }
    },
    
    showModal(modalId) {
        document.getElementById('modal-overlay').classList.add('active');
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        document.getElementById(modalId).style.display = 'block';
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
    },

    populateClasses() {
        const classes = [
            'VII.1','VII.2','VII.3','VII.4','VII.5','VII.6',
            'VIII.1','VIII.2','VIII.3','VIII.4','VIII.5','VIII.6',
            'IX.1','IX.2','IX.3','IX.4','IX.5','IX.6'
        ];
        const sis = document.getElementById('input-siswa-kelas');
        const fil = document.getElementById('filter-kelas');
        const hasilFil = document.getElementById('filter-hasil-kelas');
        
        [sis, fil, hasilFil].forEach(el => {
            if (!el) return;
            // keep previous options
            classes.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c; opt.innerText = c;
                el.appendChild(opt);
            });
        });
    },

    // --- AUTH ---
    async loginSuccess(role, studentObj = null) {
        this.currentUser = role;
        const config = await DB.getPengaturan();

        if (role === 'admin') {
            sessionStorage.setItem('cbt_user', 'admin');
            this.switchView('admin-view');
            this.refreshAdminSection('beranda');
        } else if (role === 'siswa') {
            if (!config.isExamOpen) {
                Swal.fire('Ditutup', 'Akses Ujian Saat Ini Ditutup Administrator.', 'error');
                return;
            }
            this.studentData = studentObj;
            sessionStorage.setItem('cbt_user', `siswa:${studentObj.nis}`);
            document.getElementById('siswa-nama-display').innerText = studentObj.nama;
            document.getElementById('siswa-mapel-display').innerText = config.mapel || 'Ujian';
            this.switchView('siswa-view');
            
            // Check if student already has results
            const hasilnya = await DB.getHasil();
            const sudahPernah = hasilnya.find(h => h.nis === studentObj.nis);
            if (sudahPernah) {
                Swal.fire('Informasi', 'Anda sudah menyelesaikan ujian ini.', 'info').then(() => {
                    this.logout();
                });
                return;
            }

            if (!config.token) {
                this.startExamForStudent();
            } else {
                document.getElementById('token-overlay').style.display = 'block';
                document.getElementById('soal-area-main').style.display = 'none';
                document.getElementById('navigasi-area-main').style.display = 'none';
            }
        }
    },
    logout() {
        sessionStorage.removeItem('cbt_user');
        window.location.reload();
    },

    // --- ADMIN LOGIC ---
    startAdminClock() {
        setInterval(() => {
            const d = new Date();
            document.getElementById('admin-clock').innerText = d.toLocaleTimeString('id-ID');
        }, 1000);
    },
    async refreshAdminSection(target) {
        if (target === 'beranda') {
            const s = await DB.getSiswa();
            const so = await DB.getSoal();
            const st = await DB.getPengaturan();
            const hh = await DB.getHasil();
            document.getElementById('stat-siswa').innerText = s.length;
            document.getElementById('stat-soal').innerText = so.length;
            document.getElementById('stat-selesai').innerText = hh.length;
            document.getElementById('stat-status').innerText = st.isExamOpen ? 'DIBUKA' : 'DITUTUP';
        } else if (target === 'peserta') {
            this.renderTableSiswa();
        } else if (target === 'soal') {
            this.renderTableSoal();
        } else if (target === 'hasil') {
            this.renderTableHasil();
        } else if (target === 'pengaturan') {
            const config = await DB.getPengaturan();
            if(document.getElementById('setting-jenis-ujian')) document.getElementById('setting-jenis-ujian').value = config.jenisUjian || 'Formatif 1';
            if(document.getElementById('setting-tahun-ajaran')) document.getElementById('setting-tahun-ajaran').value = config.tahunAjaran || '';
            if(document.getElementById('setting-semester')) document.getElementById('setting-semester').value = config.semester || '';
            document.getElementById('setting-mapel').value = config.mapel;
            document.getElementById('setting-durasi').value = config.durasi;
            document.getElementById('setting-token').value = config.token;
            this.updateExamStatusUI(config.isExamOpen);
        }
    },
    updateExamStatusUI(isOpen) {
        const ind = document.getElementById('exam-status-indicator');
        const txt = document.getElementById('exam-status-text');
        if (isOpen) {
            ind.classList.add('active');
            txt.innerText = 'Ujian saat ini DIBUKA. Peserta dapat login.';
        } else {
            ind.classList.remove('active');
            txt.innerText = 'Ujian saat ini DITUTUP. Peserta tidak dapat login.';
        }
    },

    async renderTableSiswa() {
        const tb = document.getElementById('table-siswa');
        const filter = document.getElementById('filter-kelas').value;
        const search = document.getElementById('search-siswa').value.toLowerCase();
        let data = await DB.getSiswa();
        
        if (filter !== 'Semua') data = data.filter(s => s.kelas === filter);
        if (search) data = data.filter(s => s.nis.includes(search) || s.nama.toLowerCase().includes(search));

        tb.innerHTML = data.map(s => `
            <tr>
                <td>${s.nis}</td>
                <td><b>${s.nama}</b></td>
                <td>${s.kelas}</td>
                <td>${s.sandi}</td>
                <td>
                    <button class="btn btn-outline btn-sm btn-edit-siswa" data-nis="${s.nis}" title="Edit"><i class="ri-edit-2-line"></i> Edit</button>
                    <button class="btn btn-danger btn-sm btn-delete-siswa" data-nis="${s.nis}" title="Hapus"><i class="ri-delete-bin-line"></i></button>
                </td>
            </tr>
        `).join('');
    },
    async editSiswa(nis) {
        const student = await DB.findSiswaByNis(nis);
        if (!student) return;
        document.getElementById('input-siswa-nis').value = student.nis;
        document.getElementById('input-siswa-nama').value = student.nama;
        document.getElementById('input-siswa-kelas').value = student.kelas;
        document.getElementById('input-siswa-sandi').value = student.sandi;
        this.editingSiswaNis = student.nis;
        this.showModal('modal-siswa');
    },
    async deleteSiswa(nis) {
        if(confirm('Yakin hapus siswa ini?')) {
            await DB.deleteSiswa(nis);
            this.renderTableSiswa();
        }
    },

    // --- SOAL ---
    renderOpsiEditor() {
        const t = document.getElementById('input-soal-tipe').value;
        const c = document.getElementById('opsi-editor-container');
        if (t === 'PG') {
            let ht = '';
            ['A','B','C','D'].forEach(o => {
                ht += `<div class="form-group"><div class="flex-row"><span style="width:30px; font-weight:bold;">${o}.</span><input type="text" id="opsi-${o}" class="input-control" placeholder="Teks opsi..." required></div></div>`;
            });
            ht += `<div class="form-group"><label>Kunci Jawaban</label><select id="key-pg" class="input-control">
                <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></div>`;
            c.innerHTML = ht;
        } else if (t === 'Kompleks') {
            let ht = '<p><small>Isi opsi, centang mana saja yang merupakan jawaban benar</small></p>';
            for(let i=1; i<=5; i++) {
                ht += `<div class="form-group"><div class="flex-row">
                    <input type="checkbox" class="key-kompleks" value="Opsi ${i}">
                    <input type="text" id="opsi-kompleks-${i}" class="input-control" placeholder="Teks opsi ${i} (Opsional jika kosong)" ${i<=2?'required':''}>
                </div></div>`;
            }
            c.innerHTML = ht;
        } else if (t === 'BS') {
            c.innerHTML = `<div class="form-group"><label>Kunci Jawaban Benar / Salah</label>
            <select id="key-bs" class="input-control"><option value="Benar">Benar</option><option value="Salah">Salah</option></select></div>`;
        }
    },
    async renderTableSoal() {
        const tb = document.getElementById('table-soal');
        const data = await DB.getSoal();
        tb.innerHTML = data.map((s, i) => `
            <tr>
                <td>${i+1}</td>
                <td>
                    ${s.jenisUjian || '-'} <br>
                    <small style="opacity:0.7">${s.tahunAjaran || '-'} | ${s.semester || '-'}</small>
                </td>
                <td><span class="badge" style="background:var(--secondary)">${s.tipe}</span></td>
                <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.teks}</td>
                <td><b>${s.jawabanBenar.join(', ')}</b></td>
                <td>
                    <button class="btn btn-danger btn-sm btn-delete-soal" data-id="${s.id}"><i class="ri-delete-bin-line"></i></button>
                </td>
            </tr>
        `).join('');
    },
    async deleteSoal(id) {
        if(confirm('Yakin hapus soal ini?')) {
            await DB.deleteSoal(id);
            this.renderTableSoal();
        }
    },

    // --- HASIL ---
    async renderTableHasil() {
        const tb = document.getElementById('table-hasil');
        const f = document.getElementById('filter-hasil-kelas').value;
        let hsl = await DB.getHasil();
        let siswaAll = await DB.getSiswa();

        // Join
        let joined = hsl.map(h => {
            const s = siswaAll.find(x => x.nis === h.nis) || { nama: 'Unknown', kelas: 'Unknown' };
            return { ...h, nama: s.nama, kelas: s.kelas };
        });

        if (f !== 'Semua') joined = joined.filter(j => j.kelas === f);

        tb.innerHTML = joined.map(j => `
            <tr>
                <td>${j.nis}</td>
                <td><b>${j.nama}</b></td>
                <td>${j.kelas}</td>
                <td>${j.mapel}</td>
                <td><span class="badge" style="background:${j.finalScore>70?'var(--success)':'var(--danger)'}; font-size:1rem">${j.finalScore.toFixed(2)}</span></td>
                <td>
                    <button class="btn btn-outline btn-sm btn-delete-hasil" data-nis="${j.nis}"><i class="ri-refresh-line"></i> Ulang</button>
                </td>
            </tr>
        `).join('');
    },
    async deleteHasil(nis) {
        if(confirm('Hapus hasil siswa ini agar dapat ujian ulang?')) {
            await DB.deleteHasil(nis);
            this.renderTableHasil();
        }
    },
    async downloadExcel() {
        const hsl = await DB.getHasil();
        const siswaAll = await DB.getSiswa();
        
        const data = hsl.map(h => {
            const s = siswaAll.find(x => x.nis === h.nis) || { nama: 'Unknown', kelas: 'Unknown' };
            return {
                NIS: h.nis,
                Nama: s.nama,
                Kelas: s.kelas,
                Mapel: h.mapel,
                WaktuSelesai: new Date(h.timestamp).toLocaleString('id-ID'),
                NilaiAkhir: h.finalScore
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Hasil CBT");
        XLSX.writeFile(wb, "Rekap_Hasil_CBT_MTsN12JKT.xlsx");
    },


    // --- SISWA LOGIC ---
    async startExamForStudent() {
        document.getElementById('token-overlay').style.display = 'none';
        
        const cfg = await DB.getPengaturan();
        let rawSoal = await DB.getSoal();
        
        // Filter based on the exam configurations
        if (cfg.jenisUjian) {
            rawSoal = rawSoal.filter(s => 
                (!s.jenisUjian || s.jenisUjian === cfg.jenisUjian) &&
                (!s.tahunAjaran || s.tahunAjaran === cfg.tahunAjaran) &&
                (!s.semester || s.semester === cfg.semester)
            );
        }
        
        if (rawSoal.length === 0) {
            Swal.fire('Maaf', 'Belum ada soal tersedia untuk ujian ini.', 'error');
            return;
        }

        // Shuffle soal randomly (Optional: we can leave it sequential if preferred)
        this.activeQuestions = rawSoal.sort(() => Math.random() - 0.5);
        this.studentAnswers = {};
        
        // build navigasi UI
        const nav = document.getElementById('navigasi-grid-container');
        nav.innerHTML = this.activeQuestions.map((s, i) => `
            <button class="nav-btn" data-idx="${i}" onclick="App.showQuestion(${i})">${i+1}</button>
        `).join('');

        document.getElementById('soal-area-main').style.display = 'block';
        document.getElementById('navigasi-area-main').style.display = 'block';

        this.timeRemaining = cfg.durasi * 60; 
        this.startExamTimer();
        this.showQuestion(0);
    },

    startExamTimer() {
        const tb = document.getElementById('exam-timer');
        this.examTimer = setInterval(() => {
            this.timeRemaining--;
            if (this.timeRemaining <= 0) {
                clearInterval(this.examTimer);
                Swal.fire('Waktu Habis!', 'Ujian akan segera dikirim otomatis', 'warning').then(() => {
                    this.processUjian();
                });
            } else {
                if (this.timeRemaining < 300) { // last 5 minutes
                    tb.classList.add('warning');
                }
                const hrs = Math.floor(this.timeRemaining / 3600);
                const mins = Math.floor((this.timeRemaining % 3600) / 60);
                const secs = this.timeRemaining % 60;
                tb.innerText = `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
            }
        }, 1000);
    },

    showQuestion(idx) {
        this.currentQuestionIndex = idx;
        const q = this.activeQuestions[idx];
        
        // update nav UI
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[data-idx="${idx}"]`).classList.add('active');

        // Check if ragu checked before
        document.getElementById('chk-ragu').checked = 
            document.querySelector(`.nav-btn[data-idx="${idx}"]`).classList.contains('doubt');

        document.getElementById('soal-nomor-display').innerText = `Soal No. ${idx + 1}`;
        document.getElementById('soal-tipe-display').innerText = q.tipe;
        
        let contentHtml = `<p>${q.teks}</p>`;
        if (q.imgData) {
            contentHtml += `<img src="${q.imgData}" alt="Ilustrasi Soal">`;
        }
        document.getElementById('soal-tek-display').innerHTML = contentHtml;

        const opsiContainer = document.getElementById('opsi-container');
        opsiContainer.innerHTML = ''; // reset
        
        if (q.tipe === 'PG') {
            q.opsi.forEach(o => {
                const isSel = this.studentAnswers[q.id] && this.studentAnswers[q.id].includes(o.label);
                const div = document.createElement('div');
                div.className = `opsi-item ${isSel ? 'selected' : ''}`;
                div.innerHTML = `<div class="opsi-label">${o.label}</div><div class="opsi-text">${o.text}</div>`;
                div.onclick = () => this.setStudentAnswer(q.id, o.label, div, 'PG');
                opsiContainer.appendChild(div);
            });
        } else if (q.tipe === 'Kompleks') {
            q.opsi.forEach(o => {
                const isSel = this.studentAnswers[q.id] && this.studentAnswers[q.id].includes(o.label);
                const div = document.createElement('div');
                div.className = `opsi-item ${isSel ? 'selected' : ''}`;
                div.innerHTML = `<input type="checkbox" style="transform: scale(1.5); margin: 0 10px;" ${isSel?'checked':''}> <div class="opsi-text">${o.text}</div>`;
                div.onclick = (e) => {
                    if(e.target.tagName !== 'INPUT') {
                        const cb = div.querySelector('input');
                        cb.checked = !cb.checked;
                    }
                    this.setStudentAnswer(q.id, o.label, div, 'Kompleks');
                };
                opsiContainer.appendChild(div);
            });
        } else if (q.tipe === 'BS') {
            ['Benar', 'Salah'].forEach(lbl => {
                const isSel = this.studentAnswers[q.id] && this.studentAnswers[q.id].includes(lbl);
                const div = document.createElement('div');
                div.className = `opsi-item ${isSel ? 'selected' : ''}`;
                div.innerHTML = `<div class="opsi-label" style="width: auto; padding:0 15px; border-radius:15px">${lbl}</div>`;
                div.onclick = () => this.setStudentAnswer(q.id, lbl, div, 'BS');
                opsiContainer.appendChild(div);
            });
        }

        if (window.MathJax) {
            MathJax.typesetPromise();
        }
    },

    setStudentAnswer(qId, val, htmlElement, tipe) {
        if (!this.studentAnswers[qId]) this.studentAnswers[qId] = [];
        
        if (tipe === 'PG' || tipe === 'BS') {
            this.studentAnswers[qId] = [val];
            document.querySelectorAll('#opsi-container .opsi-item').forEach(e => e.classList.remove('selected'));
            htmlElement.classList.add('selected');
        } else if (tipe === 'Kompleks') {
            const arr = this.studentAnswers[qId];
            if (arr.includes(val)) {
                this.studentAnswers[qId] = arr.filter(v => v !== val);
                htmlElement.classList.remove('selected');
            } else {
                this.studentAnswers[qId].push(val);
                htmlElement.classList.add('selected');
            }
        }
        
        // update nav visually
        const btn = document.querySelector(`.nav-btn[data-idx="${this.currentQuestionIndex}"]`);
        if (this.studentAnswers[qId].length > 0) {
            btn.classList.add('answered');
        } else {
            btn.classList.remove('answered');
        }
    },

    confirmSelesaiUjian() {
        const numAns = Object.keys(this.studentAnswers).filter(k => this.studentAnswers[k].length > 0).length;
        const total = this.activeQuestions.length;
        let htmlTxt = `Terdapat <b>${total - numAns}</b> soal yang belum dijawab. Yakin ingin mengakhiri?`;
        if (numAns === total) {
            htmlTxt = "Anda sudah menjawab semuanya. Yakin ingin mengirim pekerjaan sekarang?";
        }

        Swal.fire({
            title: 'Selesai Ujian?',
            html: htmlTxt,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Ya, Kirim Hasil'
        }).then((result) => {
            if (result.isConfirmed) {
                this.processUjian();
            }
        });
    },

    async processUjian() {
        clearInterval(this.examTimer);

        let correctScore = 0;
        let totalVal = this.activeQuestions.length;

        this.activeQuestions.forEach(q => {
            const stuAns = this.studentAnswers[q.id] || [];
            const keyAns = q.jawabanBenar || [];
            
            if (q.tipe === 'PG' || q.tipe === 'BS') {
                if (stuAns[0] === keyAns[0]) correctScore++;
            } else if (q.tipe === 'Kompleks') {
                // Untuk kompleks, kita beri nilai 1 jika persis sama semua pilihannya
                const stuSorted = stuAns.slice().sort();
                const keySorted = keyAns.slice().sort();
                if (stuSorted.length === keySorted.length && stuSorted.every((val, index) => val === keySorted[index])) {
                    correctScore++;
                }
            }
        });

        const finalScore = (totalVal === 0) ? 0 : (correctScore / totalVal) * 100;
        
        const settings = await DB.getPengaturan();

        await DB.saveHasilJawaban(
            this.studentData.nis, 
            this.studentAnswers, 
            finalScore, 
            settings.mapel || "Ujian CBT"
        );

        Swal.fire({
            title: 'Berhasil!',
            text: 'Jawaban Anda telah tersimpan ke server. Silakan logout.',
            icon: 'success',
            allowOutsideClick: false
        }).then(() => {
            this.logout();
        });
    }
};

// Export App globally for inline onclick handlers
window.App = App;

// Initialize App when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
