import { useEffect, useRef, useState } from 'react';

import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import LottieView from 'lottie-react-native';

import {
  Stack,
  useRouter,
  useSegments,
} from 'expo-router';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import {
  AppProvider,
  useApp,
} from '../components/AppProvider';

import {
  AuthProvider,
  useAuth,
} from '../components/AuthProvider';

const loadingAnimation: any =
  require('../assets/loading.json');