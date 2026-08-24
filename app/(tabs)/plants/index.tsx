import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Bell,
  ChevronLeft,
  Droplets,
  Pencil,
  Plus,
  Sprout,
  Sun,
  Trash2,
  X,
} from 'lucide-react-native';

import { router } from 'expo-router';

import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { DatePickerInput } from '@/components/DatePickerInput';

type Plant = {
  id: string;
  name: string;
  species: string | null;
  watering_interval_days: number;
  sunlight: string;
  last_watered_on: string | null;
  notes: string | null;
};

const SUNLIGHT_OPTIONS = [
  'Low',
  'Indirect',
  'Bright',
  'Direct',
];

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';

const PLANT_FIELDS =
  'id, name, species, watering_interval_days, sunlight, last_watered_on, notes';

const todayStr = () => {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
};

const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

const displayDate = (dateStr: string) => {
  const date = new Date(`${dateStr}T12:00:00`);

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const addDays = (
  dateStr: string,
  days: number
): string => {
  const date = new Date(`${dateStr}T12:00:00`);

  date.setDate(date.getDate() + days);

  return formatDate(date);
};

const daysUntil = (dateStr: string): number => {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const target = new Date(`${dateStr}T12:00:00`);

  target.setHours(0, 0, 0, 0);

  return Math.round(
    (target.getTime() - today.getTime()) / 86400000
  );
};

const getNextWateringDate = (plant: Plant) => {
  if (!plant.last_watered_on) {
    return null;
  }

  return addDays(
    plant.last_watered_on,
    plant.watering_interval_days
  );
};

const prettyDue = (
  plant: Plant
): {
  label: string;
  overdue: boolean;
  soon: boolean;
  nextDate: string | null;
} => {
  if (!plant.last_watered_on) {
    return {
      label: 'Not watered yet',
      overdue: false,
      soon: true,
      nextDate: null,
    };
  }

  const nextDate = getNextWateringDate(plant);

  if (!nextDate) {
    return {
      label: 'Not watered yet',
      overdue: false,
      soon: true,
      nextDate: null,
    };
  }

  const diff = daysUntil(nextDate);

  if (diff < 0) {
    const overdueDays = Math.abs(diff);

    return {
      label: `${overdueDays} day${
        overdueDays === 1 ? '' : 's'
      } overdue`,
      overdue: true,
      soon: false,
      nextDate,
    };
  }

  if (diff === 0) {
    return {
      label: 'Water today',
      overdue: false,
      soon: true,
      nextDate,
    };
  }

  if (diff === 1) {
    return {
      label: 'Water tomorrow',
      overdue: false,
      soon: true,
      nextDate,
    };
  }

  return {
    label: `Water in ${diff} days`,
    overdue: false,
    soon: false,
    nextDate,
  };
};

export default function PlantsScreen() {
  const {
    accentForeground,
    accentWash,
    isDark,
    onAccent,
  } = useApp();

  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] =
    useState<Plant | null>(null);

  const [editingPlantId, setEditingPlantId] =
    useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] =
    useState<Plant | null>(null);

  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [interval, setInterval] = useState('7');
  const [sunlight, setSunlight] = useState('Indirect');
  const [lastWatered, setLastWatered] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [wateringId, setWateringId] =
    useState<string | null>(null);
  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const C = isDark
    ? {
        bg: '#090909',
        card: '#151515',
        border: '#2A2A2A',
        text: '#F4F2EE',
        muted: '#AAA59D',
        input: '#1E1E1E',
        inputBorder: '#363636',
        inactive: '#292929',
        inactiveText: '#8E8A84',
      }
    : {
        bg: '#FBFAF8',
        card: '#FFFFFF',
        border: '#ECE9E4',
        text: '#27241F',
        muted: '#8F8A82',
        input: '#FCFBF9',
        inputBorder: '#E0DDD7',
        inactive: '#EEEDEA',
        inactiveText: '#8A8883',
      };

  const resetForm = () => {
    setEditingPlantId(null);
    setName('');
    setSpecies('');
    setInterval('7');
    setSunlight('Indirect');
    setLastWatered(todayStr());
    setNotes('');
  };

  const closePlantModal = () => {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setEditingPlantId(null);
    setError(null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: loadErr } =
      await supabase
        .from('plants')
        .select(PLANT_FIELDS)
        .order('created_at', {
          ascending: true,
        });

    if (loadErr) {
      setError(
        'Your plants could not be loaded.'
      );
    } else {
      setPlants((data ?? []) as Plant[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    resetForm();
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (plant: Plant) => {
    setEditingPlantId(plant.id);

    setName(plant.name);
    setSpecies(plant.species ?? '');

    setInterval(
      String(plant.watering_interval_days)
    );

    setSunlight(plant.sunlight);

    setLastWatered(
      plant.last_watered_on ?? ''
    );

    setNotes(plant.notes ?? '');

    setError(null);
    setDetailOpen(null);
    setModalOpen(true);
  };

  const savePlant = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Give your plant a name.');
      return;
    }

    const intervalNumber = Number(
      interval.trim()
    );

    if (
      !interval.trim() ||
      !Number.isFinite(intervalNumber) ||
      intervalNumber <= 0
    ) {
      setError(
        'Enter a watering frequency greater than 0 days.'
      );
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: trimmedName,
      species: species.trim() || null,
      watering_interval_days:
        Math.round(intervalNumber),
      sunlight,
      last_watered_on:
        lastWatered.trim() || null,
      notes: notes.trim() || null,
    };

    /*
     * EDIT EXISTING PLANT
     */
    if (editingPlantId) {
      const plantId = editingPlantId;

      const { data, error: updateErr } =
        await supabase
          .from('plants')
          .update(payload)
          .eq('id', plantId)
          .select(PLANT_FIELDS)
          .maybeSingle();

      if (updateErr || !data) {
        setError(
          'The plant could not be updated.'
        );
      } else {
        const updatedPlant =
          data as Plant;

        setPlants((current) =>
          current.map((plant) =>
            plant.id === plantId
              ? updatedPlant
              : plant
          )
        );

        setDetailOpen(null);
        setModalOpen(false);
        setEditingPlantId(null);
      }

      setSaving(false);
      return;
    }

    /*
     * CREATE NEW PLANT
     */
    const { data, error: insertErr } =
      await supabase
        .from('plants')
        .insert(payload)
        .select(PLANT_FIELDS)
        .maybeSingle();

    if (insertErr || !data) {
      setError(
        'The plant could not be saved.'
      );
    } else {
      setPlants((current) => [
        ...current,
        data as Plant,
      ]);

      setModalOpen(false);
    }

    setSaving(false);
  };

  /*
   * WATER PLANT
   */
  const waterNow = async (plant: Plant) => {
    if (wateringId === plant.id) {
      return;
    }

    const today = todayStr();

    const previousPlant = plant;

    const updatedPlant: Plant = {
      ...plant,
      last_watered_on: today,
    };

    setError(null);
    setWateringId(plant.id);

    /*
     * Update UI immediately.
     */
    setPlants((current) =>
      current.map((item) =>
        item.id === plant.id
          ? updatedPlant
          : item
      )
    );

    if (detailOpen?.id === plant.id) {
      setDetailOpen(updatedPlant);
    }

    /*
     * Save to Supabase.
     */
    const { data, error: updateErr } =
      await supabase
        .from('plants')
        .update({
          last_watered_on: today,
        })
        .eq('id', plant.id)
        .select(PLANT_FIELDS)
        .maybeSingle();

    if (updateErr || !data) {
      /*
       * Restore previous state if saving failed.
       */
      setPlants((current) =>
        current.map((item) =>
          item.id === plant.id
            ? previousPlant
            : item
        )
      );

      if (detailOpen?.id === plant.id) {
        setDetailOpen(previousPlant);
      }

      setError(
        'Could not record watering.'
      );
    } else {
      const savedPlant = data as Plant;

      setPlants((current) =>
        current.map((item) =>
          item.id === plant.id
            ? savedPlant
            : item
        )
      );

      if (detailOpen?.id === plant.id) {
        setDetailOpen(savedPlant);
      }
    }

    setWateringId(null);
  };

  /*
   * DELETE PLANT
   */
  const deletePlant = async (plant: Plant) => {
    if (deletingId === plant.id) {
      return;
    }

    const previousPlants = [...plants];

    setError(null);
    setDeletingId(plant.id);

    /*
     * Remove immediately from UI.
     */
    setPlants((current) =>
      current.filter(
        (item) => item.id !== plant.id
      )
    );

    setDeleteTarget(null);
    setDetailOpen(null);

    /*
     * Delete from Supabase.
     */
    const { error: deleteErr } =
      await supabase
        .from('plants')
        .delete()
        .eq('id', plant.id);

    if (deleteErr) {
      /*
       * Restore if delete failed.
       */
      setPlants(previousPlants);

      setError(
        'Could not delete the plant.'
      );
    }

    setDeletingId(null);
  };

  const confirmDeletePlant = (plant: Plant) => {
    setDeleteTarget(plant);
  };

  const sorted = useMemo(() => {
    return [...plants].sort((a, b) => {
      const aNext =
        getNextWateringDate(a);

      const bNext =
        getNextWateringDate(b);

      const aDays = aNext
        ? daysUntil(aNext)
        : -9999;

      const bDays = bNext
        ? daysUntil(bNext)
        : -9999;

      return aDays - bDays;
    });
  }, [plants]);

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor: C.bg,
        },
      ]}
    >
      {/* HEADER */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor: C.border,
          },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push('/modules')
          }
          style={[
            styles.headerBack,
            {
              backgroundColor:
                accentForeground,
            },
          ]}
          hitSlop={12}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={22}
            strokeWidth={2.4}
          />
        </Pressable>

        <Text
          style={[
            styles.headerTitle,
            {
              color: accentForeground,
            },
          ]}
        >
          PLANTS
        </Text>

        <Pressable
          style={styles.headerBtn}
          hitSlop={12}
        >
          <Bell
            color={C.text}
            size={22}
          />
        </Pressable>
      </View>

      {/* PLANT LIST */}

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <Text
            style={[
              styles.error,
              {
                color: '#C53A2F',
              },
            ]}
          >
            {error}
          </Text>
        )}

        {loading ? (
          <Text
            style={[
              styles.emptyText,
              {
                color: C.muted,
              },
            ]}
          >
            Loading your plants...
          </Text>
        ) : plants.length === 0 ? (
          <View style={styles.empty}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor:
                    accentWash,
                },
              ]}
            >
              <Sprout
                color={accentForeground}
                size={24}
              />
            </View>

            <Text
              style={[
                styles.emptyTitle,
                {
                  color: C.text,
                },
              ]}
            >
              No plants yet
            </Text>

            <Text
              style={[
                styles.emptyText,
                {
                  color: C.muted,
                },
              ]}
            >
              Tap the + button to start
              tracking your first plant.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {sorted.map((plant) => {
              const due =
                prettyDue(plant);

              return (
                <View
                  key={plant.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor:
                        C.card,
                      borderColor:
                        C.border,
                    },
                  ]}
                >
                  {/* TOP ROW */}

                  <View
                    style={styles.cardTop}
                  >
                    <View
                      style={[
                        styles.cardIcon,
                        {
                          backgroundColor:
                            accentWash,
                        },
                      ]}
                    >
                      <Sprout
                        color={
                          accentForeground
                        }
                        size={18}
                        strokeWidth={2.2}
                      />
                    </View>

                    {/* EDIT PEN */}

                    <Pressable
                      onPress={() =>
                        openEdit(plant)
                      }
                      hitSlop={12}
                      style={({ pressed }) => [
                        styles.editPenButton,
                        pressed && {
                          opacity: 0.5,
                        },
                      ]}
                    >
                      <Pencil
                        color={C.text}
                        size={19}
                        strokeWidth={2.2}
                      />
                    </Pressable>
                  </View>

                  {/* PLANT NAME */}

                  <Pressable
                    onPress={() =>
                      setDetailOpen(plant)
                    }
                    style={({ pressed }) => [
                      styles.cardBodyPressable,
                      pressed && {
                        opacity: 0.7,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.plantName,
                        {
                          color: C.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {plant.name}
                    </Text>

                    {plant.species ? (
                      <Text
                        style={[
                          styles.plantSpecies,
                          {
                            color:
                              C.muted,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {plant.species}
                      </Text>
                    ) : null}

                    {/* DUE TAG */}

                    <View
                      style={[
                        styles.duePill,

                        /*
                         * OVERDUE = RED
                         */
                        due.overdue &&
                          styles.duePillOverdue,

                        /*
                         * TODAY / TOMORROW
                         */
                        !due.overdue &&
                          due.soon && {
                            backgroundColor:
                              accentWash,
                          },

                        /*
                         * FUTURE = INACTIVE GREY
                         */
                        !due.overdue &&
                          !due.soon && {
                            backgroundColor:
                              C.inactive,
                          },
                      ]}
                    >
                      <Text
                        style={[
                          styles.duePillText,
                          {
                            color:
                              due.overdue
                                ? '#FFFFFF'
                                : due.soon
                                  ? accentForeground
                                  : C.inactiveText,
                          },
                        ]}
                      >
                        {due.label}
                      </Text>
                    </View>

                    {/* META */}

                    <View
                      style={styles.cardMeta}
                    >
                      <View
                        style={
                          styles.metaItem
                        }
                      >
                        <Sun
                          color={C.muted}
                          size={12}
                        />

                        <Text
                          style={[
                            styles.metaText,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          {plant.sunlight}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.metaText,
                          {
                            color: C.muted,
                          },
                        ]}
                      >
                        ·{' '}
                        {
                          plant.watering_interval_days
                        }
                        d cycle
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ADD BUTTON */}

      <Pressable
        onPress={openNew}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor:
              accentForeground,
          },
          pressed && {
            opacity: 0.85,
          },
        ]}
      >
        <Plus
          color="#FFFFFF"
          size={28}
          strokeWidth={2.6}
        />
      </Pressable>

      {/* ADD / EDIT MODAL */}

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={
          closePlantModal
        }
      >
        <View style={styles.modalShade}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            <View
              style={styles.modalTitleRow}
            >
              <Text
                style={[
                  styles.modalTitle,
                  {
                    color: C.text,
                  },
                ]}
              >
                {editingPlantId
                  ? 'Edit plant'
                  : 'New plant'}
              </Text>

              <Pressable
                onPress={
                  closePlantModal
                }
                hitSlop={12}
              >
                <X
                  color={C.muted}
                  size={21}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              {error && (
                <Text
                  style={[
                    styles.error,
                    {
                      color:
                        '#C53A2F',
                      marginTop: 4,
                    },
                  ]}
                >
                  {error}
                </Text>
              )}

              {/* NAME */}

              <Text
                style={[
                  styles.label,
                  {
                    color: C.muted,
                  },
                ]}
              >
                Name
              </Text>

              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Monstera"
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.input,
                  {
                    backgroundColor:
                      C.input,
                    borderColor:
                      C.inputBorder,
                    color: C.text,
                  },
                ]}
                autoFocus
              />

              {/* SPECIES */}

              <Text
                style={[
                  styles.label,
                  {
                    color: C.muted,
                  },
                ]}
              >
                Species (optional)
              </Text>

              <TextInput
                value={species}
                onChangeText={
                  setSpecies
                }
                placeholder="e.g. Monstera deliciosa"
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.input,
                  {
                    backgroundColor:
                      C.input,
                    borderColor:
                      C.inputBorder,
                    color: C.text,
                  },
                ]}
              />

              {/* WATERING FREQUENCY */}

              <Text
                style={[
                  styles.label,
                  {
                    color: C.muted,
                  },
                ]}
              >
                Watering frequency
              </Text>

              <View
                style={
                  styles.frequencyRow
                }
              >
                <Text
                  style={[
                    styles.frequencyText,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  Every
                </Text>

                <TextInput
                  value={interval}
                  onChangeText={(value) =>
                    setInterval(
                      value.replace(
                        /[^0-9]/g,
                        ''
                      )
                    )
                  }
                  keyboardType="number-pad"
                  placeholder="7"
                  placeholderTextColor={
                    C.muted
                  }
                  style={[
                    styles.intervalInput,
                    {
                      backgroundColor:
                        C.input,
                      borderColor:
                        C.inputBorder,
                      color: C.text,
                    },
                  ]}
                  selectTextOnFocus
                />

                <Text
                  style={[
                    styles.frequencyText,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  days
                </Text>
              </View>

              {/* SUNLIGHT */}

              <Text
                style={[
                  styles.label,
                  {
                    color: C.muted,
                  },
                ]}
              >
                Sunlight
              </Text>

              <View
                style={styles.chipRow}
              >
                {SUNLIGHT_OPTIONS.map(
                  (option) => (
                    <Pressable
                      key={option}
                      onPress={() =>
                        setSunlight(
                          option
                        )
                      }
                      style={[
                        styles.chip,
                        {
                          borderColor:
                            C.border,
                          backgroundColor:
                            C.card,
                        },
                        sunlight ===
                          option && {
                          backgroundColor:
                            accentForeground,
                          borderColor:
                            accentForeground,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color:
                              C.muted,
                          },
                          sunlight ===
                            option && {
                            color:
                              onAccent,
                            fontFamily:
                              FONT_SEMI,
                          },
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              {/* LAST WATERED */}

              <DatePickerInput
                value={lastWatered}
                onChange={
                  setLastWatered
                }
                label="Last watered"
                accent={
                  accentForeground
                }
                onAccent={onAccent}
                isDark={isDark}
                placeholder="Select date"
              />

              {/* NOTES */}

              <Text
                style={[
                  styles.label,
                  {
                    color: C.muted,
                  },
                ]}
              >
                Notes (optional)
              </Text>

              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Care tips"
                placeholderTextColor={
                  C.muted
                }
                style={[
                  styles.input,
                  styles.inputMultiline,
                  {
                    backgroundColor:
                      C.input,
                    borderColor:
                      C.inputBorder,
                    color: C.text,
                  },
                ]}
                multiline
              />

              {/* SAVE */}

              <Pressable
                disabled={saving}
                onPress={savePlant}
                style={({ pressed }) => [
                  styles.saveButton,
                  {
                    backgroundColor:
                      accentForeground,
                  },
                  saving && {
                    opacity: 0.6,
                  },
                  pressed &&
                    !saving && {
                      opacity: 0.8,
                    },
                ]}
              >
                <Text
                  style={[
                    styles.saveText,
                    {
                      color: onAccent,
                    },
                  ]}
                >
                  {saving
                    ? 'Saving...'
                    : editingPlantId
                      ? 'Save changes'
                      : 'Add plant'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* PLANT DETAIL MODAL */}

      <Modal
        visible={!!detailOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setDetailOpen(null)
        }
      >
        <View style={styles.modalShade}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  C.card,
              },
            ]}
          >
            {detailOpen &&
              (() => {
                const plant =
                  detailOpen;

                const due =
                  prettyDue(plant);

                const isWatering =
                  wateringId ===
                  plant.id;

                const isDeleting =
                  deletingId ===
                  plant.id;

                return (
                  <>
                    <View
                      style={
                        styles.modalTitleRow
                      }
                    >
                      <View
                        style={
                          styles.detailTitleWrap
                        }
                      >
                        <Text
                          style={[
                            styles.modalTitle,
                            {
                              color:
                                C.text,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {plant.name}
                        </Text>

                        {plant.species ? (
                          <Text
                            style={[
                              styles.detailSpecies,
                              {
                                color:
                                  C.muted,
                              },
                            ]}
                          >
                            {plant.species}
                          </Text>
                        ) : null}
                      </View>

                      <Pressable
                        onPress={() =>
                          setDetailOpen(
                            null
                          )
                        }
                        hitSlop={12}
                      >
                        <X
                          color={
                            C.muted
                          }
                          size={21}
                        />
                      </Pressable>
                    </View>

                    {/* DETAILS */}

                    <View
                      style={
                        styles.detailSection
                      }
                    >
                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Droplets
                          color={
                            due.overdue
                              ? '#C53A2F'
                              : accentForeground
                          }
                          size={16}
                        />

                        <Text
                          style={[
                            styles.detailText,
                            {
                              color:
                                due.overdue
                                  ? '#C53A2F'
                                  : C.text,
                            },
                          ]}
                        >
                          {due.label}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Sun
                          color={C.muted}
                          size={16}
                        />

                        <Text
                          style={[
                            styles.detailText,
                            {
                              color:
                                C.text,
                            },
                          ]}
                        >
                          {plant.sunlight}{' '}
                          light
                        </Text>
                      </View>

                      <View
                        style={
                          styles.detailLine
                        }
                      >
                        <Sprout
                          color={C.muted}
                          size={16}
                        />

                        <Text
                          style={[
                            styles.detailText,
                            {
                              color:
                                C.text,
                            },
                          ]}
                        >
                          Water every{' '}
                          {
                            plant.watering_interval_days
                          }{' '}
                          days
                        </Text>
                      </View>

                      {plant.last_watered_on ? (
                        <Text
                          style={[
                            styles.detailSub,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          Last watered:{' '}
                          {displayDate(
                            plant.last_watered_on
                          )}
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.detailSub,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          No watering
                          recorded yet
                        </Text>
                      )}

                      {due.nextDate && (
                        <Text
                          style={[
                            styles.detailSub,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          Next watering:{' '}
                          {displayDate(
                            due.nextDate
                          )}
                        </Text>
                      )}

                      {plant.notes ? (
                        <Text
                          style={[
                            styles.detailNotes,
                            {
                              color:
                                C.muted,
                            },
                          ]}
                        >
                          {plant.notes}
                        </Text>
                      ) : null}
                    </View>

                    {/* WATER + DELETE */}

                    <View
                      style={
                        styles.detailActions
                      }
                    >
                      <Pressable
                        disabled={
                          isWatering ||
                          isDeleting
                        }
                        onPress={() =>
                          waterNow(plant)
                        }
                        style={({ pressed }) => [
                          styles.detailAction,
                          {
                            backgroundColor:
                              due.overdue
                                ? '#C53A2F'
                                : accentForeground,
                          },
                          (isWatering ||
                            isDeleting) && {
                            opacity: 0.55,
                          },
                          pressed &&
                            !isWatering &&
                            !isDeleting && {
                              opacity: 0.75,
                            },
                        ]}
                      >
                        <Droplets
                          color={onAccent}
                          size={17}
                        />

                        <Text
                          style={[
                            styles.detailActionText,
                            {
                              color:
                                onAccent,
                            },
                          ]}
                        >
                          {isWatering
                            ? 'Watering...'
                            : 'Water'}
                        </Text>
                      </Pressable>

                      <Pressable
                        disabled={
                          isWatering ||
                          isDeleting
                        }
                        onPress={() =>
                          confirmDeletePlant(
                            plant
                          )
                        }
                        style={({ pressed }) => [
                          styles.detailAction,
                          styles.deleteAction,
                          {
                            backgroundColor:
                              isDark
                                ? '#241815'
                                : '#FBEAE8',
                            borderColor:
                              isDark
                                ? '#3A2422'
                                : '#F2C8C2',
                          },
                          (isWatering ||
                            isDeleting) && {
                            opacity: 0.55,
                          },
                          pressed &&
                            !isWatering &&
                            !isDeleting && {
                              opacity: 0.75,
                            },
                        ]}
                      >
                        <Trash2
                          color={
                            isDark
                              ? '#E5A39C'
                              : '#C53A2F'
                          }
                          size={17}
                        />

                        <Text
                          style={
                            styles.deleteText
                          }
                        >
                          {isDeleting
                            ? 'Deleting...'
                            : 'Delete'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}

      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDeleteTarget(null)
        }
      >
        <View
          style={styles.confirmShade}
        >
          <View
            style={[
              styles.confirmCard,
              {
                backgroundColor:
                  C.card,
                borderColor:
                  C.border,
              },
            ]}
          >
            <View
              style={
                styles.confirmIcon
              }
            >
              <Trash2
                color="#C53A2F"
                size={22}
              />
            </View>

            <Text
              style={[
                styles.confirmTitle,
                {
                  color: C.text,
                },
              ]}
            >
              Delete plant?
            </Text>

            <Text
              style={[
                styles.confirmText,
                {
                  color: C.muted,
                },
              ]}
            >
              {deleteTarget?.name} will
              be permanently removed.
            </Text>

            <View
              style={
                styles.confirmActions
              }
            >
              <Pressable
                onPress={() =>
                  setDeleteTarget(null)
                }
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor:
                      C.inactive,
                  },
                  pressed && {
                    opacity: 0.7,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.confirmCancelText,
                    {
                      color: C.text,
                    },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                disabled={!!deletingId}
                onPress={() => {
                  if (deleteTarget) {
                    deletePlant(
                      deleteTarget
                    );
                  }
                }}
                style={({ pressed }) => [
                  styles.confirmButton,
                  {
                    backgroundColor:
                      '#C53A2F',
                  },
                  deletingId && {
                    opacity: 0.55,
                  },
                  pressed &&
                    !deletingId && {
                      opacity: 0.75,
                    },
                ]}
              >
                <Text
                  style={[
                    styles.confirmDeleteText,
                  ]}
                >
                  {deletingId
                    ? 'Deleting...'
                    : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    letterSpacing: 1.5,
  },

  content: {
    padding: 16,
    paddingBottom: 100,
  },

  error: {
    fontFamily: FONT_MED,
    fontSize: 13,
    marginBottom: 10,
  },

  empty: {
    paddingVertical: 70,
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  emptyTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 17,
    marginBottom: 7,
  },

  emptyText: {
    fontFamily: FONT,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  list: {
    gap: 12,
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editPenButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardBodyPressable: {
    borderRadius: 10,
  },

  plantName: {
    fontFamily: FONT_BOLD,
    fontSize: 15,
  },

  plantSpecies: {
    fontFamily: FONT,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },

  duePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 8,
  },

  duePillOverdue: {
    backgroundColor: '#C53A2F',
  },

  duePillText: {
    fontFamily: FONT_SEMI,
    fontSize: 11,
  },

  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  metaText: {
    fontFamily: FONT,
    fontSize: 11,
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 6,
  },

  modalShade: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(0,0,0,0.45)',
  },

  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 34,
    maxHeight: '92%',
  },

  modalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },

  modalTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 18,
    flex: 1,
    marginRight: 12,
  },

  modalScroll: {
    maxHeight: '80%',
  },

  detailTitleWrap: {
    flex: 1,
    marginRight: 12,
  },

  detailSpecies: {
    fontFamily: FONT,
    fontSize: 13,
    marginTop: 4,
  },

  label: {
    fontFamily: FONT_MED,
    fontSize: 13,
    marginTop: 14,
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: FONT,
    fontSize: 15,
  },

  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  frequencyText: {
    fontFamily: FONT_MED,
    fontSize: 15,
  },

  intervalInput: {
    width: 70,
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontFamily: FONT_MED,
    fontSize: 15,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },

  chipText: {
    fontFamily: FONT,
    fontSize: 13,
  },

  saveButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 22,
  },

  saveText: {
    fontFamily: FONT_SEMI,
    fontSize: 15,
  },

  detailSection: {
    marginTop: 8,
    gap: 12,
    paddingVertical: 8,
  },

  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  detailText: {
    fontFamily: FONT_MED,
    fontSize: 14,
  },

  detailSub: {
    fontFamily: FONT,
    fontSize: 13,
    marginLeft: 26,
    lineHeight: 20,
  },

  detailNotes: {
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  detailActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },

  detailAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  deleteAction: {
    borderWidth: 1,
  },

  deleteText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: '#C53A2F',
  },

  detailActionText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  confirmShade: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor:
      'rgba(0,0,0,0.5)',
  },

  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
  },

  confirmIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBEAE8',
    marginBottom: 16,
  },

  confirmTitle: {
    fontFamily: FONT_BOLD,
    fontSize: 19,
    marginBottom: 8,
  },

  confirmText: {
    fontFamily: FONT,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },

  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },

  confirmButton: {
    flex: 1,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmCancelText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
  },

  confirmDeleteText: {
    fontFamily: FONT_SEMI,
    fontSize: 14,
    color: '#FFFFFF',
  },
});