// db.js
// Handles all data persistence using LocalForage (IndexedDB abstraction)

const DB = {
    _init: false,
    
    // Store instances
    stores: {
        siswa: localforage.createInstance({ name: "CBT_DB", storeName: "siswa" }),
        soal: localforage.createInstance({ name: "CBT_DB", storeName: "soal" }),
        hasil: localforage.createInstance({ name: "CBT_DB", storeName: "hasil" }),
        pengaturan: localforage.createInstance({ name: "CBT_DB", storeName: "pengaturan" })
    },

    async init() {
        if (this._init) return;
        
        // Setup default settings if not exists
        const settings = await this.stores.pengaturan.getItem('config');
        if (!settings) {
            await this.stores.pengaturan.setItem('config', {
                jenisUjian: 'Formatif 1',
                tahunAjaran: '2023/2024',
                semester: 'Ganjil',
                mapel: 'Matematika',
                durasi: 120, // minutes
                token: '', // empty means no token required
                isExamOpen: false
            });
        }
        
        this._init = true;
    },

    // --- SISWA (PESERTA) ---
    async getSiswa() {
        const data = await this.stores.siswa.getItem('data');
        return data || [];
    },
    async saveSiswa(siswaArray) {
        await this.stores.siswa.setItem('data', siswaArray);
    },
    async updateSiswa(oldNis, nis, nama, kelas, sandi) {
        let data = await this.getSiswa();
        const index = data.findIndex(s => s.nis === oldNis);
        if (index === -1) throw new Error("Siswa tidak ditemukan.");
        if (oldNis !== nis && data.find(s => s.nis === nis)) {
            throw new Error(`Siswa dengan NIS ${nis} sudah ada.`);
        }
        data[index] = { nis, nama, kelas, sandi };
        await this.saveSiswa(data);
    },
    async addSiswa(nis, nama, kelas, sandi) {
        const data = await this.getSiswa();
        // Cek duplicate
        if (data.find(s => s.nis === nis)) {
            throw new Error(`Siswa dengan NIS ${nis} sudah ada.`);
        }
        data.push({ nis, nama, kelas, sandi });
        await this.saveSiswa(data);
    },
    async deleteSiswa(nis) {
        let data = await this.getSiswa();
        data = data.filter(s => s.nis !== nis);
        await this.saveSiswa(data);
    },
    async findSiswaByNis(nis) {
        const data = await this.getSiswa();
        return data.find(s => s.nis === nis);
    },

    // --- BANK SOAL ---
    async getSoal() {
        const data = await this.stores.soal.getItem('data');
        return data || [];
    },
    async saveSoal(soalArray) {
        await this.stores.soal.setItem('data', soalArray);
    },
    async addSoal(soalObj) {
        const data = await this.getSoal();
        // assign id
        soalObj.id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
        data.push(soalObj);
        await this.saveSoal(data);
    },
    async deleteSoal(id) {
        let data = await this.getSoal();
        data = data.filter(s => s.id !== id);
        await this.saveSoal(data);
    },

    // --- PENGATURAN ---
    async getPengaturan() {
        return await this.stores.pengaturan.getItem('config');
    },
    async savePengaturan(settingsObj) {
        const current = await this.getPengaturan();
        await this.stores.pengaturan.setItem('config', { ...current, ...settingsObj });
    },

    // --- HASIL UJIAN ---
    async getHasil() {
        const data = await this.stores.hasil.getItem('data');
        return data || [];
    },
    async saveHasilJawaban(nis, answers, finalScore, mapel) {
        const data = await this.getHasil();
        const existingIndex = data.findIndex(h => h.nis === nis);
        
        const hasilObj = {
            nis,
            answers,
            finalScore,
            mapel,
            timestamp: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            data[existingIndex] = hasilObj; // update if retake
        } else {
            data.push(hasilObj);
        }
        await this.stores.hasil.setItem('data', data);
    },
    async deleteHasil(nis) {
        let data = await this.getHasil();
        data = data.filter(h => h.nis !== nis);
        await this.stores.hasil.setItem('data', data);
    },

    // --- DATA RESET ---
    async resetAll() {
        await this.stores.siswa.clear();
        await this.stores.soal.clear();
        await this.stores.hasil.clear();
        await this.stores.pengaturan.clear();
        this._init = false;
        await this.init(); // re-init defaults
    }
};
