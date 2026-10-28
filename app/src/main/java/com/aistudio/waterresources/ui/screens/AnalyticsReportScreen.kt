package com.aistudio.waterresources.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aistudio.waterresources.data.model.ComplianceStatus
import com.aistudio.waterresources.data.model.Language
import com.aistudio.waterresources.ui.theme.*
import com.aistudio.waterresources.ui.viewmodel.WaterResourcesUiState

@Composable
fun AnalyticsReportScreen(
    state: WaterResourcesUiState,
    modifier: Modifier = Modifier
) {
    val isLao = state.language == Language.LO

    var selectedExportSystem by remember { mutableStateOf("WQ") } // WQ, USAGE, WASTEWATER
    var selectedDatasetKey by remember { mutableStateOf("ALL") }
    var lastExportNotice by remember { mutableStateOf<String?>(null) }

    val totalStations = state.stations.size
    val compliantStations = state.stations.count { it.overallStatus == ComplianceStatus.NORMAL }
    val wqComplianceRate = if (totalStations > 0) (compliantStations * 100 / totalStations) else 100

    val totalFacilities = state.wastewaterFacilities.size
    val compliantFacilities = state.wastewaterFacilities.count { it.complianceStatus == ComplianceStatus.NORMAL }
    val wwComplianceRate = if (totalFacilities > 0) (compliantFacilities * 100 / totalFacilities) else 100

    val totalUsageM3 = state.usageProjects.sumOf { it.waterVolume }
    val totalWastewaterM3 = state.wastewaterFacilities.sumOf { it.dischargeVolume }

    val datasetOptions = remember(selectedExportSystem, state.stations, state.usageProjects, state.wastewaterFacilities) {
        when (selectedExportSystem) {
            "WQ" -> listOf("ALL" to (if (isLao) "📚 ທຸກຊຸດຂໍ້ມູນຄຸນນະພາບນໍ້າ (${state.stations.size})" else "All Water Quality Datasets (${state.stations.size})")) +
                    state.stations.map { it.id to "🧪 ${it.name} (${it.province})" }
            "USAGE" -> listOf("ALL" to (if (isLao) "📚 ທຸກຊຸດຂໍ້ມູນການນໍາໃຊ້ນໍ້າ (${state.usageProjects.size})" else "All Water Usage Datasets (${state.usageProjects.size})")) +
                    state.usageProjects.map { it.id to "💧 ${it.projectName} (${it.province})" }
            else -> listOf("ALL" to (if (isLao) "📚 ທຸກຊຸດຂໍ້ມູນການປ່ອຍນໍ້າເປື້ອນ (${state.wastewaterFacilities.size})" else "All Wastewater Datasets (${state.wastewaterFacilities.size})")) +
                    state.wastewaterFacilities.map { it.id to "🏭 ${it.facilityName} (${it.province})" }
        }
    }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(Slate950)
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Column {
                Text(
                    text = if (isLao) "📊 ບົດວິເຄາະສະຖິຕິ ແລະ ຫ້ອງສົ່ງອອກບົດລາຍງານ" else "📊 Annual Water Resources Analytical & Export Hub",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = Slate100
                )
                Text(
                    text = if (isLao) "ບົດສະຫຼຸບສັງລວມຄຸນນະພາບນໍ້າ, ການນຳໃຊ້ນໍ້າ ແລະ ການປ່ອຍນ້ຳເປື້ອນແຫ່ງຊາດ" else "National Summary of Quality, Concessions, & Discharges",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Slate400
                )
            }
        }

        // Report Export Hub Card with Dataset Selector across all 3 Systems
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Slate900),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().testTag("export_dataset_selector_card")
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = if (isLao) "📥 ຫ້ອງສົ່ງອອກບົດລາຍງານ (ເລືອກຊຸດຂໍ້ມູນທີ່ຕ້ອງການສົ່ງອອກ)" else "📥 Report Export Hub (Select Dataset)",
                        style = MaterialTheme.typography.titleMedium,
                        color = Emerald400,
                        fontWeight = FontWeight.Bold
                    )

                    // 1. System Selector
                    Text(
                        text = if (isLao) "1. ເລືອກລະບົບ:" else "1. Select System:",
                        color = Slate300,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val systems = listOf(
                            "WQ" to (if (isLao) "🧪 ລະບົບຄຸນນະພາບນໍ້າ" else "Water Quality"),
                            "USAGE" to (if (isLao) "💧 ລະບົບການນໍາໃຊ້ນໍ້າ" else "Water Usage"),
                            "WASTEWATER" to (if (isLao) "🏭 ລະບົບການປ່ອຍນໍ້າເປື້ອນ" else "Wastewater")
                        )
                        systems.forEach { (key, label) ->
                            FilterChip(
                                selected = selectedExportSystem == key,
                                onClick = {
                                    selectedExportSystem = key
                                    selectedDatasetKey = "ALL"
                                    lastExportNotice = null
                                },
                                label = { Text(label, fontSize = 11.sp) }
                            )
                        }
                    }

                    // 2. Dataset Selector Chips
                    Text(
                        text = if (isLao) "2. ຊ່ອງເລືອກຊຸດຂໍ້ມູນທີ່ຕ້ອງການສົ່ງອອກບົດລາຍງານ:" else "2. Select Dataset to Export:",
                        color = Cyan400,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        datasetOptions.forEach { (dsKey, dsLabel) ->
                            FilterChip(
                                selected = selectedDatasetKey == dsKey,
                                onClick = {
                                    selectedDatasetKey = dsKey
                                    lastExportNotice = null
                                },
                                label = { Text(dsLabel, fontSize = 11.sp) }
                            )
                        }
                    }

                    // Export Action Buttons
                    val selectedLabel = datasetOptions.find { it.first == selectedDatasetKey }?.second ?: "ALL"
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                lastExportNotice = if (isLao)
                                    "✅ ສົ່ງອອກບົດລາຍງານ Excel ສຳເລັດ: $selectedLabel"
                                else
                                    "✅ Exported Excel Report: $selectedLabel"
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Emerald500),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (isLao) "📊 ສົ່ງອອກ Excel" else "Export Excel", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                        Button(
                            onClick = {
                                lastExportNotice = if (isLao)
                                    "📄 ສົ່ງອອກບົດລາຍງານ PDF ສຳເລັດ: $selectedLabel"
                                else
                                    "📄 Exported PDF Report: $selectedLabel"
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Indigo500),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (isLao) "📄 ສົ່ງອອກ PDF" else "Export PDF", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    if (lastExportNotice != null) {
                        Text(
                            text = lastExportNotice!!,
                            color = Emerald400,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        // Compliance Overview Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Slate900),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().testTag("compliance_overview_card")
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = if (isLao) "ອັດຕາການປະຕິບັດຕາມມາດຕະຖານແຫ່ງຊາດ" else "National Environmental Compliance Rate",
                        style = MaterialTheme.typography.titleMedium,
                        color = Slate100,
                        fontWeight = FontWeight.Bold
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = if (isLao) "ຄຸນນະພາບນ້ຳໜ້າດິນ:" else "Surface Water Quality:", color = Slate300, fontSize = 13.sp)
                        Text(text = "$wqComplianceRate%", color = Emerald400, fontWeight = FontWeight.Black, fontSize = 16.sp)
                    }
                    LinearProgressIndicator(
                        progress = { wqComplianceRate / 100f },
                        modifier = Modifier.fillMaxWidth().height(8.dp),
                        color = Emerald400,
                        trackColor = Slate800
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = if (isLao) "ມາດຕະຖານນ້ຳເປື້ອນໂຮງງານ:" else "Industrial Effluent Standard:", color = Slate300, fontSize = 13.sp)
                        Text(text = "$wwComplianceRate%", color = Cyan400, fontWeight = FontWeight.Black, fontSize = 16.sp)
                    }
                    LinearProgressIndicator(
                        progress = { wwComplianceRate / 100f },
                        modifier = Modifier.fillMaxWidth().height(8.dp),
                        color = Cyan400,
                        trackColor = Slate800
                    )
                }
            }
        }

        // Water Balance Card
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Slate900),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = if (isLao) "ດຸ່ນດ່ຽງປະລິມານນ້ຳ (Water Balance Indicator)" else "Water Balance Volume",
                        style = MaterialTheme.typography.titleMedium,
                        color = Indigo400,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "• ປະລິມານນ້ຳດິບນຳໃຊ້: %,.0f m³/day".format(totalUsageM3),
                        color = Slate200,
                        fontSize = 13.sp
                    )
                    Text(
                        text = "• ປະລິມານນ້ຳເປື້ອນປ່ອຍອອກ: %,.0f m³/day".format(totalWastewaterM3),
                        color = Slate200,
                        fontSize = 13.sp
                    )
                    Text(
                        text = "• ອັດຕາສ່ວນນ້ຳເປື້ອນຕໍ່ການນຳໃຊ້: %.2f%%".format(if (totalUsageM3 > 0) totalWastewaterM3 * 100 / totalUsageM3 else 0.0),
                        color = Slate400,
                        fontSize = 12.sp
                    )
                }
            }
        }

        // Key Findings
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Slate900),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = if (isLao) "ຂໍ້ສະເໜີແນະ ແລະ ມາດຕະການຕິດຕາມ" else "Recommendations & Directives",
                        style = MaterialTheme.typography.titleMedium,
                        color = Rose400,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = if (isLao)
                            "1. ສືບຕໍ່ຕິດຕາມກວດກາສະຖານີຈຸດສຸມເຂດ ນະຄອນປາກເຊ ທີ່ມີຄ່າ BOD ແລະ TSS ເກີນມາດຕະຖານ.\n2. ເລັ່ງລັດໃຫ້ໂຮງງານແປຮູບທີ່ຍັງບໍ່ທັນມີລະບົບ Telemetry ຕິດຕັ້ງເຄື່ອງວັດແທກອັດຕະໂນມັດ.\n3. ກວດກາຄືນບັນດາໂຄງການທີ່ໃບອະນຸຍາດນຳໃຊ້ນ້ຳໃກ້ໝົດອາຍຸ."
                        else
                            "1. Continue intense monitoring at Pakse station with elevated BOD and TSS.\n2. Mandate real-time telemetry sensors for all industrial effluent outfalls.\n3. Audit concession permits nearing expiration dates.",
                        color = Slate300,
                        fontSize = 12.sp,
                        lineHeight = 18.sp
                    )
                }
            }
        }
    }
}
