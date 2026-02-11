/**
 * BAP4A LOGISTICS AUDIT GENERATOR ENGINE [V.21.05 - SEGMENTED COPY]
 * Role: Senior Warehouse Auditor & Data Analyst
 */

const BAPGenerator = {
    // Internal storage for generated sections (text only)
    lastGenerated: {
        part1: "",
        part2: "",
        part3: ""
    },

    generate: function () {
        console.log("BAPGenerator.generate() called [v21:05]");
        try {
            // 1. Collect Core Inputs
            const material = document.getElementById('input-material').value || "[MATERIAL]";
            const sloc = document.getElementById('input-sloc').value || "[GUDANG]";
            const condition = document.getElementById('input-condition').value;
            const amountTotal = parseFloat(document.getElementById('input-amount').value) || 0;
            const percentTotal = document.getElementById('input-percent').value || "0%";
            const receiptsTotal = parseFloat(document.getElementById('input-receipts').value) || 0;

            const reasonA = document.getElementById('input-reason-a').value || "tidak dijelaskan";
            const reasonB = document.getElementById('input-reason-b').value || "tidak dijelaskan";
            const planRaw = document.getElementById('input-plan').value || "melakukan pemantauan";

            const statusA = (window.factorStatus && window.factorStatus.A) ? window.factorStatus.A : 'validated';
            const statusB = (window.factorStatus && window.factorStatus.B) ? window.factorStatus.B : 'validated';

            // 2. Mathematical Analysis
            let impactA_pct = 0;
            let impactB_pct = 0;
            if (statusA === 'support') impactA_pct = parseFloat(document.getElementById('input-impact-a').value) || 0;
            if (statusB === 'support') impactB_pct = parseFloat(document.getElementById('input-impact-b').value) || 0;

            const valImpactA = (impactA_pct / 100) * receiptsTotal;
            const valImpactB = (impactB_pct / 100) * receiptsTotal;
            const totalExplained = valImpactA + valImpactB;
            const netDiscrepancy = amountTotal - totalExplained;

            // 3. Section I: Permasalahan
            const conditionText = condition === "SUSUT" ? "Susut (Selisih Kurang)" : "Over (Selisih Lebih)";
            let p1_body = `Berdasarkan hasil audit fisik, teridentifikasi adanya kondisi ${conditionText} pada stok material ${material} di lokasi ${sloc} sebesar ${amountTotal.toLocaleString()} Ton (${percentTotal}). `;
            p1_body += condition === "SUSUT"
                ? `Kondisi ini menunjukkan bahwa volume fisik yang berada di lokasi penyimpanan lebih rendah dibandingkan dengan catatan pada sistem inventory, yang mengindikasikan adanya pengeluaran material yang tidak tercatat secara akurat atau kegagalan pembacaan sistem.`
                : `Hal ini mengindikasikan bahwa sistem pencatatan memotong saldo inventori secara berlebih dibandingkan dengan volume fisik yang sebenarnya keluar, sehingga saldo fisik di lapangan ditemukan lebih besar daripada saldo buku.`;

            this.lastGenerated.part1 = `I. PERMASALAHAN\n${p1_body}`;

            // 4. Section II: Root Cause
            const narasiA = this.mapFactorNarrative("A", statusA, reasonA, impactA_pct, valImpactA, receiptsTotal);
            const narasiB = this.mapFactorNarrative("B", statusB, reasonB, impactB_pct, valImpactB, receiptsTotal);

            let p2_text = `Analisis Faktor A: ${narasiA}\nAnalisis Faktor B: ${narasiB}\n\nRINCIAN ANALISIS NUMERIK:\n`;
            p2_text += `• Total Selisih Awal: ${amountTotal.toLocaleString()} Ton\n`;
            p2_text += `• Selisih Tervalidasi (A + B): ${totalExplained.toLocaleString()} Ton\n`;
            p2_text += `• Selisih Bersih (Net Discrepancy): ${netDiscrepancy.toLocaleString()} Ton\n`;
            p2_text += `*Hasil perhitungan di atas menunjukkan bahwa setelah dikurangi faktor pendukung yang tervalidasi, masih terdapat deviasi sebesar ${netDiscrepancy.toLocaleString()} Ton yang belum teridentifikasi akar penyebabnya.`;

            this.lastGenerated.part2 = `II. ANALISIS DATA PENDUKUNG (ROOT CAUSE)\n${p2_text}`;

            // 5. Section III: Rencana & Target
            const strategicPlan = this.enhancePlan(planRaw, netDiscrepancy, material);
            const targetOutput = `Target dari tindakan ini adalah mengeliminasi sisa deviasi sebesar ${netDiscrepancy.toLocaleString()} Ton dan memastikan angka stok pada periode pelaporan berikutnya kembali sinkron sesuai standar toleransi perusahaan.`;

            this.lastGenerated.part3 = `III. RENCANA PERBAIKAN & TARGET\n${strategicPlan}\n\nTarget: ${targetOutput}`;

            // 6. Build Final Render (Merged View)
            const finalHtml = `
                <h3>I. PERMASALAHAN</h3>
                <p>${p1_body}</p>
                
                <h3>II. ANALISIS DATA PENDUKUNG (ROOT CAUSE)</h3>
                <p><strong>Analisis Faktor A:</strong> ${narasiA}</p>
                <p><strong>Analisis Faktor B:</strong> ${narasiB}</p>
                <div style="background:rgba(0,243,255,0.05); padding:15px; border-radius:8px; margin-top:15px; border:1px dashed rgba(0,243,255,0.2);">
                    <strong>RINCIAN ANALISIS NUMERIK:</strong><br>
                    • Total Selisih Awal: ${amountTotal.toLocaleString()} Ton<br>
                    • Selisih Tervalidasi (A + B): ${totalExplained.toLocaleString()} Ton<br>
                    • <strong>Selisih Bersih (Net Discrepancy): ${netDiscrepancy.toLocaleString()} Ton</strong><br>
                    <span style="font-size:0.8rem; color:#94a3b8;">*Hasil perhitungan di atas menunjukkan bahwa setelah dikurangi faktor pendukung yang tervalidasi, masih terdapat deviasi sebesar ${netDiscrepancy.toLocaleString()} Ton yang belum teridentifikasi akar penyebabnya.</span>
                </div>

                <h3>III. RENCANA PERBAIKAN & TARGET</h3>
                <p>${strategicPlan}</p>
                <p><strong>Target:</strong> ${targetOutput}</p>
            `.trim();

            const outputDiv = document.getElementById('report-output');
            if (outputDiv) {
                outputDiv.innerHTML = finalHtml;
                document.getElementById('action-btns').style.display = 'flex';
            }

        } catch (err) {
            console.error("Generation failed:", err);
            alert("Terjadi kesalahan teknis.");
        }
    },

    mapFactorNarrative: function (type, status, reason, pct, val, total) {
        const factorLabel = type === "A" ? "Teknis/Peralatan" : "Administrasi/Operasional";
        if (status === "support") {
            return `Dinyatakan sebagai Penyebab Utama (Root Cause). Ditemukan kondisi ${reason} yang memberikan dampak sebesar ${pct}% dari total penerimaan (${total.toLocaleString()} Ton), atau setara dengan ${val.toLocaleString()} Ton. Hal ini menjelaskan sebagian dari total selisih yang terjadi.`;
        } else {
            return `Dinyatakan Tervalidasi Normal. Hasil audit menunjukkan bahwa prosedur ${factorLabel} (${reason}) telah berjalan sesuai SOP dan bukan merupakan penyebab munculnya deviasi stok.`;
        }
    },

    enhancePlan: function (raw, netAmount, material) {
        let enhanced = raw.charAt(0).toUpperCase() + raw.slice(1);
        if (!enhanced.toLowerCase().startsWith('melakukan') && !enhanced.toLowerCase().startsWith('mengadakan') && !enhanced.toLowerCase().startsWith('memperketat')) {
            enhanced = "Melakukan " + raw;
        }
        enhanced = enhanced.replace(/kalibrasi/gi, "re-kalibrasi menyeluruh dan pengujian akurasi alat");
        enhanced = enhanced.replace(/cek/gi, "pemeriksaan intensif dan validasi rutin");
        enhanced = enhanced.replace(/bersih/gi, "pembersihan periodik dan perawatan preventif");
        return `${enhanced} guna menanggulangi temuan sisa selisih (Net) sebesar ${netAmount.toLocaleString()} Ton pada material ${material} agar tidak terulang pada siklus audit mendatang.`;
    },

    copySection: function (num) {
        const key = "part" + num;
        const text = this.lastGenerated[key];
        if (!text) {
            alert("Silakan generate laporan terlebih dahulu.");
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            const partNames = ["Permasalahan (Bag. I)", "Analisis (Bag. II)", "Rencana (Bag. III)"];
            alert(`${partNames[num - 1]} disalin ke clipboard!`);
        });
    }
};
