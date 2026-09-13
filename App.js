import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Modal,
  TextInput,
  Linking,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './supabase';

const { width } = Dimensions.get('window');

function MainScreen() {
  const [currentScreen, setCurrentScreen] = useState('DESK');
  const [activeTab, setActiveTab] = useState('CORTO');
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [followedTrades, setFollowedTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados del Formulario de Alta
  const [isNewTradeOpen, setIsNewTradeOpen] = useState(false);
  const [formTab, setFormTab] = useState('CORTO');
  const [ticker, setTicker] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [tp1, setTp1] = useState('');
  const [tp2, setTp2] = useState('');
  const [tp3, setTp3] = useState('');
  const [tvUrl, setTvUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTrades();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => {
          fetchTrades();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const calculateTradeStatus = (item) => {
    const current = Number(item.current);
    const entry = Number(item.entry);
    const stop = Number(item.stop);
    const baseProfits = Array.isArray(item.profits) ? item.profits : [];

    const evaluatedProfits = baseProfits.map((p) => {
      const targetPrice = Number(p.price);
      const isHit = current >= targetPrice;
      return {
        ...p,
        hit: isHit,
      };
    });

    const hitCount = evaluatedProfits.filter((p) => p.hit).length;

    let dynamicBadge = item.badge;
    let dynamicBadgeType = item.badge_type;

    if (current <= stop) {
      dynamicBadge = 'Z. Stop';
      dynamicBadgeType = 'STOP';
    } else if (hitCount > 0) {
      dynamicBadge = `TP${hitCount} (${hitCount})`;
      dynamicBadgeType = 'TP';
    } else if (current > entry) {
      dynamicBadge = 'En Ganancia';
      dynamicBadgeType = 'DESARME';
    } else {
      dynamicBadge = 'Activa';
      dynamicBadgeType = 'DEFAULT';
    }

    return {
      id: String(item.id),
      tab: item.tab,
      ticker: item.ticker,
      date: item.date_label,
      entry,
      stop,
      target: Number(item.target),
      current,
      badge: dynamicBadge,
      badgeType: dynamicBadgeType,
      profits: evaluatedProfits,
      tvUrl: item.tv_url,
    };
  };

  const fetchTrades = async () => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        console.error('Error al traer trades:', error);
      } else if (data) {
        const formatted = data.map(calculateTradeStatus);
        setPositions(formatted);

        setSelectedTrade((prev) => {
          if (!prev) return null;
          return formatted.find((t) => t.id === prev.id) || null;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTrade = async () => {
    if (!ticker.trim() || !entryPrice || !stopPrice || !tp1) {
      Alert.alert('Datos requeridos', 'Completá Ticker, Entrada, Stop Loss y al menos el Target 1.');
      return;
    }

    const e = parseFloat(entryPrice.replace(',', '.'));
    const s = parseFloat(stopPrice.replace(',', '.'));
    const t1 = parseFloat(tp1.replace(',', '.'));
    const t2 = tp2 ? parseFloat(tp2.replace(',', '.')) : null;
    const t3 = tp3 ? parseFloat(tp3.replace(',', '.')) : null;

    if (isNaN(e) || isNaN(s) || isNaN(t1)) {
      Alert.alert('Formato inválido', 'Los precios ingresados deben ser numéricos.');
      return;
    }

    setIsSaving(true);

    const profits = [
      {
        label: 'Profit 1',
        price: t1,
        pct: `+${(((t1 - e) / e) * 100).toFixed(2)}%`,
        hit: false,
      },
    ];

    let maxTarget = t1;

    if (t2 && !isNaN(t2)) {
      profits.push({
        label: 'Profit 2',
        price: t2,
        pct: `+${(((t2 - e) / e) * 100).toFixed(2)}%`,
        hit: false,
      });
      maxTarget = t2;
    }

    if (t3 && !isNaN(t3)) {
      profits.push({
        label: 'Profit 3',
        price: t3,
        pct: `+${(((t3 - e) / e) * 100).toFixed(2)}%`,
        hit: false,
      });
      maxTarget = t3;
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateLabel = `${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const newRecord = {
      tab: formTab,
      ticker: ticker.toUpperCase().trim(),
      date_label: dateLabel,
      entry: e,
      stop: s,
      target: maxTarget,
      current: e,
      badge: 'Activa',
      badge_type: 'DEFAULT',
      tv_url: tvUrl.trim() || `https://www.tradingview.com/chart/?symbol=${ticker.toUpperCase().trim()}`,
      profits,
    };

    const { error } = await supabase.from('trades').insert([newRecord]);

    setIsSaving(false);

    if (error) {
      console.log('Error Supabase insert:', error);
      Alert.alert('Error al guardar', error.message || JSON.stringify(error));
    } else {
      Alert.alert('Éxito', '¡Posición publicada correctamente!');
      setTicker('');
      setEntryPrice('');
      setStopPrice('');
      setTp1('');
      setTp2('');
      setTp3('');
      setTvUrl('');
      setIsNewTradeOpen(false);
      fetchTrades();
    }
  };

  const sentimentFeed = [
    { id: '1', tag: '#VIX', title: 'Sentimiento #VIX', date: 'Hoy 09:18', note: 'Volatilidad en compresión. Atentos a quiebre de soporte.' },
    { id: '2', tag: '#BTCUSD', title: 'Sentimiento #BTCUSD', date: 'Hoy 08:45', note: 'Rebote intradiario en zona de liquidez previa.' },
    { id: '3', tag: '#CCL', title: 'Sentimiento #DolarCable', date: 'Ayer 17:30', note: 'Flujo de cauciones BYMA impactando en la brecha cambiaria.' },
  ];

  const toggleFollow = (id) => {
    if (followedTrades.includes(id)) {
      setFollowedTrades(followedTrades.filter((item) => item !== id));
    } else {
      setFollowedTrades([...followedTrades, id]);
    }
  };

  const displayedPositions = positions.filter((p) => {
    const matchesTab = p.tab === activeTab;
    if (currentScreen === 'MIS_POSICIONES') {
      return matchesTab && followedTrades.includes(p.id);
    }
    return matchesTab;
  });

  const getBadgeStyle = (type) => {
    switch (type) {
      case 'TP':
        return { bg: '#064E3B', border: '#10B981', text: '#34D399' };
      case 'STOP':
        return { bg: '#450A0A', border: '#DC2626', text: '#F87171' };
      case 'DESARME':
        return { bg: '#451A03', border: '#D97706', text: '#FBBF24' };
      default:
        return { bg: '#1E293B', border: '#475569', text: '#94A3B8' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#05080E" translucent={false} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.menuIconBtn} onPress={() => setIsMenuOpen(true)}>
          <Text style={styles.menuIconText}>☰</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleBox}>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.headerTitle}>PRISMA</Text>
            <Text style={[styles.headerTitle, { color: '#F8FAFC' }]}> INVESTING</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            {currentScreen === 'MIS_POSICIONES' ? 'MI CARTERA ACTIVA' : 'TERMINAL DE INVERSIÓN'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerRightAction}
          onPress={() => setCurrentScreen(currentScreen === 'MIS_POSICIONES' ? 'DESK' : 'MIS_POSICIONES')}
        >
          <Text style={styles.headerRightIcon}>
            {currentScreen === 'MIS_POSICIONES' ? '🌐' : '⭐'}
          </Text>
        </TouchableOpacity>
      </View>

      {(currentScreen === 'DESK' || currentScreen === 'MIS_POSICIONES') && (
        <>
          <View style={styles.tabContainer}>
            {['CORTO', 'LARGO', 'CRIPTO'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={styles.loadingText}>Sincronizando con Supabase...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.listContainer}>
              {displayedPositions.map((item) => {
                const pnl = (((item.current - item.entry) / item.entry) * 100).toFixed(2);
                const isPositive = item.current >= item.entry;
                const isFollowed = followedTrades.includes(item.id);
                const badgeStyle = getBadgeStyle(item.badgeType);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.card}
                    activeOpacity={0.7}
                    onPress={() => setSelectedTrade(item)}
                  >
                    <View style={styles.leftCol}>
                      <View style={styles.tickerRow}>
                        <Text style={styles.ticker}>{item.ticker}</Text>
                        <TouchableOpacity
                          onPress={() => toggleFollow(item.id)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={styles.followBtn}
                        >
                          <Text style={[styles.followStar, isFollowed && styles.followStarActive]}>
                            {isFollowed ? '★' : '☆'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.date}>{item.date}</Text>

                      <View style={styles.levelRow}>
                        <Text style={styles.levelLabel}>Ingreso: </Text>
                        <Text style={styles.levelVal}>${item.entry}</Text>
                      </View>
                      <View style={styles.levelRow}>
                        <Text style={styles.levelLabel}>Stop: </Text>
                        <Text style={styles.levelVal}>${item.stop}</Text>
                      </View>
                      <View style={styles.levelRow}>
                        <Text style={styles.levelLabel}>Target: </Text>
                        <Text style={[styles.levelVal, { color: '#10B981' }]}>${item.target}</Text>
                      </View>
                    </View>

                    <View style={styles.midCol}>
                      <Text style={styles.currentLabel}>PRECIO ACTUAL</Text>
                      <Text style={styles.currentPrice}>${item.current}</Text>
                      <View style={[styles.pnlBadge, { backgroundColor: isPositive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }]}>
                        <Text style={[styles.pnlText, { color: isPositive ? '#34D399' : '#EF4444' }]}>
                          {isPositive ? `+${pnl}%` : `${pnl}%`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.rightCol}>
                      <View style={[styles.badge, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border }]}>
                        <Text style={[styles.badgeText, { color: badgeStyle.text }]}>
                          {item.badge}
                        </Text>
                      </View>
                      <Text style={styles.detailHint}>Detalle ›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {displayedPositions.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {currentScreen === 'MIS_POSICIONES'
                      ? 'No estás siguiendo operaciones en esta categoría. Tocá la estrella en cualquier posición para sumarla a tu cartera.'
                      : 'Sin operaciones activas en esta categoría.'}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Botón flotante para abrir el panel de carga rápida */}
          <TouchableOpacity
            style={styles.fabButton}
            activeOpacity={0.85}
            onPress={() => setIsNewTradeOpen(true)}
          >
            <Text style={styles.fabText}>+ NUEVA POSICIÓN</Text>
          </TouchableOpacity>
        </>
      )}

      {currentScreen === 'SENTIMIENTO' && (
        <ScrollView contentContainerStyle={styles.listContainer}>
          {sentimentFeed.map((item) => (
            <View key={item.id} style={styles.sentimentCard}>
              <View style={styles.sentimentHeader}>
                <Text style={styles.sentimentTitle}>{item.title}</Text>
                <Text style={styles.sentimentDate}>{item.date}</Text>
              </View>
              <Text style={styles.sentimentNote}>{item.note}</Text>
              <TouchableOpacity style={styles.sentimentBtn}>
                <Text style={styles.sentimentBtnText}>VER ANÁLISIS EN VIVO</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {currentScreen === 'OPINION' && (
        <ScrollView contentContainerStyle={styles.listContainer}>
          <View style={styles.opinionBox}>
            <Text style={styles.opinionDate}>12/09/2026 - INFORME DIARIO</Text>
            <Text style={styles.opinionHeading}>Arbitraje de Tasas & Bonos Soberanos</Text>
            <Text style={styles.opinionBody}>
              Comportamiento mixto en la curva de Lecaps y bonos CER. Monitoreamos spreads de tasa implícita en futuros de Rofex y volumen de cauciones Dólar Cable.
            </Text>
          </View>
        </ScrollView>
      )}

      {currentScreen === 'ESTADISTICAS' && (
        <ScrollView contentContainerStyle={styles.listContainer}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>TRAZABILIDAD DE RESULTADOS</Text>
            <TouchableOpacity style={[styles.statsBtn, { backgroundColor: '#064E3B', borderColor: '#10B981' }]}>
              <Text style={styles.statsBtnText}>📈 CERRADOS POSITIVOS: 84.6%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.statsBtn, { backgroundColor: '#450A0A', borderColor: '#DC2626', marginTop: 12 }]}>
              <Text style={styles.statsBtnText}>📉 CERRADOS NEGATIVOS: 15.4%</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Modal Formulario Nueva Posición */}
      <Modal
        visible={isNewTradeOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsNewTradeOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTicker}>Nueva Operación</Text>
              <TouchableOpacity onPress={() => setIsNewTradeOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>CATEGORÍA</Text>
              <View style={styles.formCategoryRow}>
                {['CORTO', 'LARGO', 'CRIPTO'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChoice, formTab === cat && styles.categoryChoiceActive]}
                    onPress={() => setFormTab(cat)}
                  >
                    <Text style={[styles.categoryChoiceText, formTab === cat && styles.categoryChoiceTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>TICKER / ACTIVO (EJ: AAPL, GGAL, BTC)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="TICKER"
                placeholderTextColor="#475569"
                value={ticker}
                onChangeText={setTicker}
                autoCapitalize="characters"
              />

              <View style={styles.dualInputRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>PRECIO ENTRADA ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0.00"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                    value={entryPrice}
                    onChangeText={setEntryPrice}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>STOP LOSS ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0.00"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                    value={stopPrice}
                    onChangeText={setStopPrice}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>TARGET 1 ($) *OBLIGATORIO</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Precio Objetivo 1"
                placeholderTextColor="#475569"
                keyboardType="numeric"
                value={tp1}
                onChangeText={setTp1}
              />

              <View style={styles.dualInputRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.inputLabel}>TARGET 2 ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Opcional"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                    value={tp2}
                    onChangeText={setTp2}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>TARGET 3 ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Opcional"
                    placeholderTextColor="#475569"
                    keyboardType="numeric"
                    value={tp3}
                    onChangeText={setTp3}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>LINK TRADINGVIEW (OPCIONAL)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="https://www.tradingview.com/..."
                placeholderTextColor="#475569"
                value={tvUrl}
                onChangeText={setTvUrl}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.saveTradeBtn, isSaving && { opacity: 0.6 }]}
                onPress={handleCreateTrade}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#05080E" />
                ) : (
                  <Text style={styles.saveTradeBtnText}>PUBLICAR POSICIÓN</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Detalle Trade */}
      <Modal
        visible={selectedTrade !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedTrade(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTrade && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTicker}>{selectedTrade.ticker}</Text>
                    <Text style={styles.modalDate}>{selectedTrade.date}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedTrade(null)} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalPriceBox}>
                  <View>
                    <Text style={styles.modalLabel}>PRECIO ACTUAL</Text>
                    <Text style={styles.modalPriceVal}>${selectedTrade.current}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.modalLabel}>RENDIMIENTO</Text>
                    <Text
                      style={[
                        styles.modalPnlVal,
                        {
                          color: selectedTrade.current >= selectedTrade.entry ? '#34D399' : '#EF4444',
                        },
                      ]}
                    >
                      {(((selectedTrade.current - selectedTrade.entry) / selectedTrade.entry) * 100).toFixed(2)}%
                    </Text>
                  </View>
                </View>

                <Text style={styles.targetsTitle}>OBJETIVOS ESCALONADOS</Text>
                <View style={styles.targetsList}>
                  {selectedTrade.profits.map((p, idx) => (
                    <View key={idx} style={[styles.targetItem, p.hit && styles.targetItemHit]}>
                      <Text style={[styles.targetLabel, p.hit && { color: '#10B981', fontWeight: 'bold' }]}>
                        {p.hit ? `✓ ${p.label}` : p.label}
                      </Text>
                      <Text style={styles.targetPrice}>${p.price}</Text>
                      <Text style={styles.targetPct}>{p.pct}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.tvButton}
                  onPress={() => selectedTrade.tvUrl && Linking.openURL(selectedTrade.tvUrl)}
                >
                  <Text style={styles.tvButtonText}>📊 Ver Gráfico en TradingView</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Drawer Lateral */}
      <Modal
        visible={isMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setIsMenuOpen(false)} />
          <View style={styles.drawerContent}>
            <View style={styles.profileBox}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>CF</Text>
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.profileName}>Cristian Foncuberta</Text>
                <Text style={styles.profileRole}>Prisma Desk Lead</Text>
              </View>
            </View>

            <View style={styles.menuItemsList}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setCurrentScreen('DESK'); setIsMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, currentScreen === 'DESK' && styles.menuItemActive]}>
                  📊 Desk / Seguimientos Globales
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setCurrentScreen('MIS_POSICIONES'); setIsMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, currentScreen === 'MIS_POSICIONES' && styles.menuItemActive]}>
                  ⭐ Mis Posiciones ({followedTrades.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setCurrentScreen('SENTIMIENTO'); setIsMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, currentScreen === 'SENTIMIENTO' && styles.menuItemActive]}>
                  ⚡ Sentimiento / Alertas
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setCurrentScreen('OPINION'); setIsMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, currentScreen === 'OPINION' && styles.menuItemActive]}>
                  📰 Opinión & Macro Diario
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => { setCurrentScreen('ESTADISTICAS'); setIsMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, currentScreen === 'ESTADISTICAS' && styles.menuItemActive]}>
                  📈 Trazabilidad & Estadísticas
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeDrawerBtn} onPress={() => setIsMenuOpen(false)}>
              <Text style={styles.closeDrawerText}>Cerrar Menú</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05080E',
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#070C16',
  },
  menuIconBtn: {
    padding: 6,
  },
  menuIconText: {
    color: '#10B981',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitleBox: {
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  headerTitle: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  headerRightAction: {
    padding: 6,
  },
  headerRightIcon: {
    fontSize: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#090E17',
    padding: 4,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  tabText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#34D399',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 12,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 90,
    gap: 12,
  },
  card: {
    backgroundColor: '#0A0F1D',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#162235',
  },
  leftCol: {
    flex: 1.3,
  },
  tickerRow: {
    flexDirection: 'row',
  },
  ticker: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '900',
  },
  followBtn: {
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  followStar: {
    fontSize: 18,
    color: '#475569',
  },
  followStarActive: {
    color: '#FBBF24',
  },
  date: {
    color: '#64748B',
    fontSize: 10,
    marginBottom: 6,
    marginTop: 1,
  },
  levelRow: {
    flexDirection: 'row',
  },
  levelLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  levelVal: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  midCol: {
    flex: 1,
    alignItems: 'center',
  },
  currentLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  currentPrice: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  pnlBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  pnlText: {
    fontSize: 12,
    fontWeight: '800',
  },
  rightCol: {
    flex: 0.9,
    alignItems: 'flex-end',
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 11,
  },
  detailHint: {
    color: '#10B981',
    fontSize: 11,
    marginTop: 8,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  fabText: {
    color: '#05080E',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#090E17',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTicker: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
  },
  modalDate: {
    color: '#64748B',
    fontSize: 12,
  },
  closeButton: {
    padding: 6,
  },
  closeButtonText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalPriceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  modalLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  modalPriceVal: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  modalPnlVal: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  targetsTitle: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  targetsList: {
    gap: 8,
    marginBottom: 16,
  },
  targetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  targetItemHit: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  targetLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  targetPrice: {
    color: '#94A3B8',
    fontSize: 13,
  },
  targetPct: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  tvButton: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  tvButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#0A0F1D',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#F8FAFC',
    fontSize: 14,
  },
  dualInputRow: {
    flexDirection: 'row',
  },
  formCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  categoryChoice: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0A0F1D',
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  categoryChoiceActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  categoryChoiceText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12,
  },
  categoryChoiceTextActive: {
    color: '#34D399',
  },
  saveTradeBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  saveTradeBtnText: {
    color: '#05080E',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  drawerContent: {
    width: width * 0.78,
    backgroundColor: '#070B14',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
    paddingTop: 48,
    paddingHorizontal: 16,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  profileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    marginBottom: 20,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#05080E',
    fontWeight: '900',
    fontSize: 16,
  },
  profileName: {
    color: '#F8FAFC',
    fontWeight: 'bold',
    fontSize: 15,
  },
  profileRole: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  menuItemsList: {
    gap: 14,
  },
  menuItem: {
    paddingVertical: 10,
  },
  menuItemText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemActive: {
    color: '#34D399',
    fontWeight: 'bold',
  },
  closeDrawerBtn: {
    marginTop: 'auto',
    marginBottom: 30,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  closeDrawerText: {
    color: '#94A3B8',
    fontWeight: '700',
  },
  sentimentCard: {
    backgroundColor: '#0A0F1D',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#162235',
  },
  sentimentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sentimentTitle: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: 'bold',
  },
  sentimentDate: {
    color: '#64748B',
    fontSize: 12,
  },
  sentimentNote: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  sentimentBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  sentimentBtnText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  opinionBox: {
    backgroundColor: '#0A0F1D',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#162235',
  },
  opinionDate: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  opinionHeading: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  opinionBody: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
  },
  statsCard: {
    backgroundColor: '#0A0F1D',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#162235',
  },
  statsTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  statsBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});