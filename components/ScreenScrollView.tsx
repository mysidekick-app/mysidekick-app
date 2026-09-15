import React, { forwardRef } from 'react';

import {
  ScrollView,
  ScrollViewProps,
} from 'react-native';

const ScreenScrollView = forwardRef<ScrollView, ScrollViewProps>(
  ({ contentContainerStyle, style, ...props }, ref) => {
    return (
      <ScrollView
        ref={ref}
        {...props}
        style={[
          styles.scrollView,
          style,
        ]}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    );
  }
);

ScreenScrollView.displayName = 'ScreenScrollView';

const styles = {
  scrollView: {
    flex: 1,
  },
};

export default ScreenScrollView;
