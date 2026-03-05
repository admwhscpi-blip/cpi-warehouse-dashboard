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

            const planRaw = document.getElementById('input-plan').value || "melakukan pemantauan";

            // 2. Mathematical Analysis & Factor Processing
            let totalExplained = 0;
            let factorsData = [];

            const factorIds = Object.keys(window.factorStatus);
            let factorIndex = 0;
            for (let fId of factorIds) {
                const elName = document.getElementById(`input-factor-name-${fId}`);
                if (!elName) continue; // safety check

                const factorName = elName.value || `Faktor ${String.fromCharCode(65 + factorIndex)}`;
                const status = window.factorStatus[fId];
                const reason = document.getElementById(`input-reason-${fId}`).value || "tidak dijelaskan";

                let impactPct = 0;
                let valImpact = 0;

                if (status === 'support') {
                    impactPct = parseFloat(document.getElementById(`input-impact-${fId}`).value) || 0;
                    valImpact = (impactPct / 100) * receiptsTotal;
                    totalExplained += valImpact;
                }

                factorsData.push({
                    name: factorName,
                    status: status,
                    reason: reason,
                    impactPct: impactPct,
                    valImpact: valImpact
                });

                factorIndex++;
            }

            const netDiscrepancy = amountTotal - totalExplained;
            const isNegative = netDiscrepancy < 0;
            const absNetDiscrepancy = Math.abs(netDiscrepancy);

            let finalCondition = condition;
            let kondisiAwal = condition === "SUSUT" ? "SUSUT" : "OVERFISIK";
            let kondisiAkhir = kondisiAwal;

            if (isNegative) {
                finalCondition = condition === "SUSUT" ? "OVER" : "SUSUT";
                kondisiAkhir = finalCondition === "SUSUT" ? "SUSUT" : "OVERFISIK";
            }

            // 3. Section I: Permasalahan
            let p1_body = `Berdasarkan hasil audit fisik, teridentifikasi adanya kondisi awal berupa ${condition === "SUSUT" ? "Susut (Selisih Kurang)" : "Over (Selisih Lebih)"} pada stok material ${material} di lokasi ${sloc} sebesar ${amountTotal.toLocaleString()} KG (${percentTotal}). `;
            p1_body += condition === "SUSUT"
                ? `Kondisi awal ini menunjukkan bahwa volume fisik yang berada di lokasi penyimpanan lebih rendah dibandingkan dengan catatan pada sistem inventory, yang mengindikasikan adanya pengeluaran material yang tidak tercatat secara akurat atau kegagalan pembacaan sistem.`
                : `Kondisi awal ini mengindikasikan bahwa sistem pencatatan memotong saldo inventori secara berlebih dibandingkan dengan volume fisik yang sebenarnya keluar, sehingga saldo fisik di lapangan ditemukan lebih besar daripada saldo buku.`;

            this.lastGenerated.part1 = `I. PERMASALAHAN\n${p1_body}`;

            // 4. Section II: Root Cause
            let p2_text = "";
            let factorsHtml = "";

            factorsData.forEach((f, idx) => {
                const label = String.fromCharCode(65 + idx);
                const narasi = this.mapFactorNarrative(f.name, f.status, f.reason, f.impactPct, f.valImpact, receiptsTotal);
                p2_text += `Analisis Faktor ${label} (${f.name}): ${narasi}\n`;
                factorsHtml += `<p><strong>Analisis Faktor ${label} (${f.name}):</strong> ${narasi}</p>`;
            });

            // Membuat tabel mini berbasis teks
            let tableText = `\nRINCIAN ANALISIS NUMERIK:\n`;
            tableText += `==================================================\n`;
            tableText += `Total Selisih Awal          : ${amountTotal.toLocaleString()} KG (${kondisiAwal})\n`;
            tableText += `--------------------------------------------------\n`;
            factorsData.forEach((f, idx) => {
                if (f.status === 'support') {
                    const label = String.fromCharCode(65 + idx);
                    tableText += `Tervalidasi Faktor ${label}        : ${f.valImpact.toLocaleString()} KG\n`;
                }
            });
            tableText += `--------------------------------------------------\n`;
            tableText += `Total Faktor Tervalidasi    : ${totalExplained.toLocaleString()} KG\n`;
            tableText += `==================================================\n`;
            tableText += `Selisih Bersih (Net)        : ${absNetDiscrepancy.toLocaleString()} KG (${kondisiAkhir})\n`;

            if (isNegative) {
                tableText += `\n*Catatan Penting: Selisih awal didata sebagai ${kondisiAwal}. Setelah memperhitungkan faktor validasi yang nilainya melampaui selisih awal, kondisi bersih berbalik menjadi ${kondisiAkhir} aktual sebesar ${absNetDiscrepancy.toLocaleString()} KG.\n`;
            } else {
                tableText += `\n*Hasil perhitungan di atas menunjukkan bahwa setelah dikurangi faktor pendukung yang tervalidasi, masih terdapat deviasi ${kondisiAkhir} sebesar ${absNetDiscrepancy.toLocaleString()} KG yang belum teridentifikasi akar penyebabnya.\n`;
            }

            p2_text += tableText;
            this.lastGenerated.part2 = `II. ANALISIS DATA PENDUKUNG (ROOT CAUSE)\n${p2_text}`;

            // 5. Section III: Rencana & Target
            const strategicPlan = this.enhancePlan(planRaw, absNetDiscrepancy, material);
            const targetOutput = `Target dari tindakan ini adalah mengeliminasi sisa deviasi sebesar ${absNetDiscrepancy.toLocaleString()} KG dan memastikan angka stok pada periode pelaporan berikutnya kembali sinkron sesuai standar toleransi perusahaan.`;

            this.lastGenerated.part3 = `III. RENCANA PERBAIKAN & TARGET\n${strategicPlan}\n\nTarget: ${targetOutput}`;

            // 6. Build Final Render (Merged View)
            const finalHtml = `
                <h3>I. PERMASALAHAN</h3>
                <p>${p1_body}</p>
                
                <h3>II. ANALISIS DATA PENDUKUNG (ROOT CAUSE)</h3>
                ${factorsHtml || "<p><em>Tidak ada faktor analisis penunjang.</em></p>"}
                <div style="background:rgba(0,243,255,0.05); padding:15px; border-radius:8px; margin-top:15px; border:1px dashed rgba(0,243,255,0.2); font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; font-size: 0.85rem; line-height: 1.6;">${tableText.trim()}</div>

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

    mapFactorNarrative: function (factorName, status, reason, pct, val, total) {
        if (status === "support") {
            return `Dinyatakan sebagai Penyebab Utama (Root Cause). Ditemukan kondisi terkait Data ${factorName} (${reason}) yang memberikan dampak sebesar ${pct}% dari total penerimaan (${total.toLocaleString()} KG), atau setara dengan ${val.toLocaleString()} KG. Hal ini menjelaskan sebagian dari total selisih yang terjadi.`;
        } else {
            return `Dinyatakan Tervalidasi Normal. Hasil audit menunjukkan bahwa parameter Data ${factorName} (${reason}) telah sesuai standar / berada dalam batas toleransi wajar dan bukan merupakan penyebab munculnya deviasi stok.`;
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
        return `${enhanced} guna menanggulangi temuan sisa selisih (Net) sebesar ${netAmount.toLocaleString()} KG pada material ${material} agar tidak terulang pada siklus audit mendatang.`;
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
