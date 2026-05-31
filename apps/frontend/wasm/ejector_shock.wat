(module
  (func $calculate_shock_location (export "calculate_shock_location")
    (param $M_inlet f64) (param $back_pressure_ratio f64) (param $is_choked f64) (param $omega f64)
    (result f64)
    
    (if (f64.le (local.get $M_inlet) (f64.const 1.0))
      (then (return (f64.const -1.0))))
    
    (local $base_location f64)
    (local $back_pressure_correction f64)
    (local $choke_correction f64)
    (local $omega_correction f64)
    (local $raw_location f64)
    
    (local.set $base_location
      (f64.add
        (f64.const 0.3)
        (f64.mul
          (f64.const 0.4)
          (f64.sub (local.get $M_inlet) (f64.const 1.0)))))
    
    (local.set $back_pressure_correction
      (f64.sub
        (f64.const 1.0)
        (f64.mul (local.get $back_pressure_ratio) (f64.const 0.3))))
    
    (local.set $choke_correction
      (if (result f64) (f64.gt (local.get $is_choked) (f64.const 0.0))
        (then (f64.const 0.9))
        (else (f64.const 1.0))))
    
    (local.set $omega_correction
      (f64.add
        (f64.const 0.7)
        (f64.mul (f64.const 0.6) (local.get $omega))))
    
    (local.set $raw_location
      (f64.mul
        (f64.mul
          (f64.mul (local.get $base_location) (local.get $back_pressure_correction))
          (local.get $choke_correction))
        (local.get $omega_correction)))
    
    (if (f64.lt (local.get $raw_location) (f64.const 0.15))
      (then (local.set $raw_location (f64.const 0.15))))
    
    (if (f64.gt (local.get $raw_location) (f64.const 0.85))
      (then (local.set $raw_location (f64.const 0.85))))
    
    (local.get $raw_location))
  
  (func $normal_shock_relations (export "normal_shock_relations")
    (param $M1 f64)
    (result f64)
    
    (local $gamma f64)
    (local $M2 f64)
    (local $P2_P1 f64)
    
    (local.set $gamma (f64.const 1.33))
    
    (local.set $P2_P1
      (f64.div
        (f64.sub
          (f64.mul
            (f64.mul (f64.const 2.0) (local.get $gamma))
            (f64.mul (local.get $M1) (local.get $M1)))
          (f64.sub (local.get $gamma) (f64.const 1.0)))
        (f64.add (local.get $gamma) (f64.const 1.0))))
    
    (local.get $P2_P1))
  
  (func $apply_damping (export "apply_damping")
    (param $prev f64) (param $raw f64) (param $damping_coeff f64)
    (result f64)
    
    (local $delta f64)
    (local $alpha f64)
    
    (local.set $delta (f64.sub (local.get $raw) (local.get $prev)))
    (local.set $alpha (f64.sub (f64.const 1.0) (local.get $damping_coeff)))
    
    (f64.add (local.get $prev) (f64.mul (local.get $delta) (local.get $alpha))))
  
  (func $calculate_entrainment_peak (export "calculate_entrainment_peak")
    (param $omega f64)
    (result f64)
    
    (local $peak_omega f64)
    (local $peak_width f64)
    (local $diff f64)
    
    (local.set $peak_omega (f64.const 0.4))
    (local.set $peak_width (f64.const 0.25))
    
    (local.set $diff (f64.div (f64.sub (local.get $omega) (local.get $peak_omega)) (local.get $peak_width)))
    
    (f64.exp (f64.neg (f64.mul (local.get $diff) (local.get $diff)))))
)
