import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronLeft, MoreVertical, Search, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useApp } from '@/components/AppProvider';
import { useState } from 'react';
const FONT_BOLD = 'Poppins-Bold';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_MED = 'Poppins-Medium';
const FONT = 'Poppins-Regular';

export function PageHeader({ title, actionLabel, onAction, onBack, showBell, financeMode, onSetCurrency }: { title: string; actionLabel?: string; onAction?: () => void; onBack?: () => void; showBell?: boolean; financeMode?: boolean; onSetCurrency?: () => void }) {
  const { isDark, accentForeground, onAccent } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleBack = () => {
    if (onBack) onBack();
    else router.push('/modules');
  };

  if (financeMode) {
    return (
      <View>
        <View style={[styles.container, isDark && styles.containerDark]}>
          <Pressable onPress={handleBack} style={[styles.financeBackBtn, { backgroundColor: accentForeground }]} hitSlop={12}>
            <ChevronLeft color="#FFFFFF" size={22} strokeWidth={2.4} />
          </Pressable>
          <Text style={[styles.title, { color: accentForeground }]}>{title.toUpperCase()}</Text>
          <Pressable style={styles.rightBtn} hitSlop={12}>
            <Bell color={isDark ? '#F4F2EE' : '#292722'} size={20} />
          </Pressable>
          <Pressable onPress={() => setMenuOpen(true)} style={[styles.rightBtn, { right: 48 }]} hitSlop={12}>
            <MoreVertical color={isDark ? '#F4F2EE' : '#292722'} size={20} />
          </Pressable>
        </View>

        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={styles.menuShade} onPress={() => setMenuOpen(false)}>
            <View style={[styles.menuCard, isDark && styles.menuCardDark]}>
              <Pressable onPress={() => { setMenuOpen(false); onSetCurrency?.(); }} style={styles.menuItem}>
                <Text style={[styles.menuItemText, isDark && styles.darkText]}>Set currency</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Pressable onPress={() => onBack ? onBack() : router.back()} style={styles.leftBtn} hitSlop={12}>
          <ChevronLeft color={isDark ? '#F4F2EE' : '#292722'} size={24} />
        </Pressable>
        <Text style={[styles.title, { color: accentForeground }]}>{title.toUpperCase()}</Text>
        {showBell ? (
          <Pressable style={styles.rightBtn} hitSlop={12}>
            <Bell color={isDark ? '#F4F2EE' : '#292722'} size={20} />
          </Pressable>
        ) : (
          <Pressable onPress={onAction} style={[styles.rightBtn, actionLabel && { backgroundColor: accentForeground, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }]} hitSlop={12}>
            {actionLabel ? <><Text style={[styles.actionText, { color: onAccent }]}>{actionLabel}</Text></> : <MoreVertical color={isDark ? '#F4F2EE' : '#292722'} size={20} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE9E4',
  },
  containerDark: { borderBottomColor: '#2A2A2A' },
  leftBtn: { position: 'absolute', left: 8, padding: 4 },
  rightBtn: { position: 'absolute', right: 8, padding: 4 },
  financeBackBtn: { position: 'absolute', left: 8, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: FONT_SEMI, fontSize: 14 },
  title: { fontFamily: FONT_BOLD, fontSize: 18, letterSpacing: 1.5 },
  menuShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 60, paddingRight: 16 },
  menuCard: { backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#ECE9E4', paddingVertical: 8, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  menuCardDark: { backgroundColor: '#1C1C1C', borderColor: '#2A2A2A' },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontFamily: FONT_MED, fontSize: 14, color: '#27241F' },
  darkText: { color: '#F4F2EE' },
});
