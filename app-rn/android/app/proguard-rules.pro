# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# expo-notifications: BroadcastReceiver and notification lifecycle listeners
# The BroadcastReceiver is instantiated dynamically via AndroidManifest.xml
-keep class expo.modules.notifications.service.NotificationsService { *; }
# Listeners for notification events (dynamically referenced)
-keep class expo.modules.notifications.service.delegates.ExpoNotificationLifecycleListener { *; }
-keep class expo.modules.notifications.service.delegates.ExpoPresentationDelegate { *; }
-keep class expo.modules.notifications.service.delegates.ExpoHandlingDelegate { *; }
-keep class expo.modules.notifications.service.delegates.ExpoSchedulingDelegate { *; }

# Add any project specific keep options here:
