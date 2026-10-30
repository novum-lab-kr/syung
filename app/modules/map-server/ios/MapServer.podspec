Pod::Spec.new do |s|
  s.name           = 'MapServer'
  s.version        = '1.0.0'
  s.summary        = '앱 묶음 안 지도 파일을 127.0.0.1 로만 내주는 작은 http 서버'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'novum-lab'
  s.homepage       = 'https://map.syung.novum-lab.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.swift'
end
