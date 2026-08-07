PROGRAM CuveRegulationAvancee
  VAR
    (* Entrees TOR physiques / simulation eventuelle *)
    BtnStartAuto      AT %IX0.0 : BOOL;
    BtnStopAuto       AT %IX0.1 : BOOL;
    BtnPompeManu      AT %IX0.2 : BOOL;
    BtnVidangeManu    AT %IX0.3 : BOOL;
    CapteurNiveauBas  AT %IX0.4 : BOOL;
    CapteurNiveauHaut AT %IX0.5 : BOOL;

    (* Sorties reelles lues par SCADA *)
    PompeRemplissage AT %QX0.0 : BOOL;
    VanneVidange     AT %QX0.1 : BOOL;
    AlarmeNivBas     AT %QX0.2 : BOOL;
    AlarmeNivHaut    AT %QX0.3 : BOOL;
    ModeAutoActifOut AT %QX0.4 : BOOL;

    (* Commandes HMI / Node-RED *)
    CmdModeAuto       AT %QX1.0 : BOOL;  (* Modbus coil 8  *)
    CmdPompeManu      AT %QX1.1 : BOOL;  (* Modbus coil 9  *)
    CmdVidangeManu    AT %QX1.2 : BOOL;  (* Modbus coil 10 *)
    CmdResetNiveau    AT %QX1.3 : BOOL;  (* Modbus coil 11 *)

    (* Sorties analogiques *)
    NiveauCuveSortie AT %QW0 : INT;
    ConsigneSortie   AT %QW1 : INT;
  END_VAR

  VAR
    NiveauSimu            : REAL;
    ConsigneNiveau        : REAL;
    BandeMorte            : REAL;
    VariationRemplissage  : REAL;
    VariationVidange      : REAL;

    ModeAutoActif         : BOOL;
    CmdPompeEffective     : BOOL;
    CmdVidangeEffective   : BOOL;

    InitDone              : BOOL := FALSE;
  END_VAR

  (* ---------- Initialisation premier scan ---------- *)
  IF NOT InitDone THEN
    (* Demarrage en manuel, tout arrete *)
    CmdModeAuto    := FALSE;
    CmdPompeManu   := FALSE;
    CmdVidangeManu := FALSE;
    CmdResetNiveau := FALSE;

    ModeAutoActif  := FALSE;

    ConsigneNiveau       := 60.0;
    BandeMorte           := 3.0;

    (* Variation lente pour demo : cycle PLC = 100 ms *)
    VariationRemplissage := 0.05;
    VariationVidange     := 0.07;

    NiveauSimu := 53.0;

    PompeRemplissage := FALSE;
    VanneVidange     := FALSE;
    AlarmeNivBas     := FALSE;
    AlarmeNivHaut    := FALSE;

    InitDone := TRUE;
  END_IF;

  (* ---------- Commandes mode auto ---------- *)
  IF BtnStartAuto THEN
    CmdModeAuto := TRUE;
  END_IF;

  IF BtnStopAuto THEN
    CmdModeAuto := FALSE;
  END_IF;

  ModeAutoActif := CmdModeAuto;
  ModeAutoActifOut := ModeAutoActif;

  (* ---------- Reset niveau pour demo ---------- *)
  IF CmdResetNiveau THEN
    NiveauSimu := 53.0;
    CmdResetNiveau := FALSE;
  END_IF;

  (* ---------- Calcul des sorties reelles ---------- *)
  IF ModeAutoActif THEN

    (* Mode AUTO : regulation vers la consigne *)
    IF NiveauSimu < (ConsigneNiveau - BandeMorte) THEN
      PompeRemplissage := TRUE;
      VanneVidange     := FALSE;

    ELSIF NiveauSimu > (ConsigneNiveau + BandeMorte) THEN
      PompeRemplissage := FALSE;
      VanneVidange     := TRUE;

    ELSE
      PompeRemplissage := FALSE;
      VanneVidange     := FALSE;
    END_IF;

  ELSE

    (* Mode MANUEL : commandes HMI ou entrees physiques *)
    CmdPompeEffective   := CmdPompeManu OR BtnPompeManu;
    CmdVidangeEffective := CmdVidangeManu OR BtnVidangeManu;

    (* Interverrouillage : pompe et vidange jamais ensemble *)
    IF CmdPompeEffective AND NOT CmdVidangeEffective THEN
      PompeRemplissage := TRUE;
      VanneVidange     := FALSE;

    ELSIF CmdVidangeEffective AND NOT CmdPompeEffective THEN
      PompeRemplissage := FALSE;
      VanneVidange     := TRUE;

    ELSE
      PompeRemplissage := FALSE;
      VanneVidange     := FALSE;
    END_IF;

  END_IF;

  (* ---------- Securites process ---------- *)

  (* Ne pas remplir si niveau trop haut *)
  IF NiveauSimu >= 95.0 THEN
    PompeRemplissage := FALSE;
  END_IF;

  (* Ne pas vidanger sous le niveau minimum *)
  IF NiveauSimu <= 10.0 THEN
    VanneVidange := FALSE;
  END_IF;

  (* ---------- Simulation du niveau de cuve ---------- *)
  IF PompeRemplissage AND NOT VanneVidange THEN
    NiveauSimu := NiveauSimu + VariationRemplissage;

  ELSIF VanneVidange AND NOT PompeRemplissage THEN
    NiveauSimu := NiveauSimu - VariationVidange;

  ELSE
    (* Pompe OFF et vanne OFF : niveau stable *)
    NiveauSimu := NiveauSimu;
  END_IF;

  (* ---------- Bornes 0..100 pourcent ---------- *)
  IF NiveauSimu < 0.0 THEN
    NiveauSimu := 0.0;
  END_IF;

  IF NiveauSimu > 100.0 THEN
    NiveauSimu := 100.0;
  END_IF;

  (* ---------- Alarmes ---------- *)
  AlarmeNivBas  := (NiveauSimu <= 10.0) OR (CapteurNiveauBas AND NOT CapteurNiveauHaut);
  AlarmeNivHaut := (NiveauSimu >= 90.0) OR CapteurNiveauHaut;

  (* ---------- Sorties analogiques ---------- *)
  NiveauCuveSortie := REAL_TO_INT(NiveauSimu);
  ConsigneSortie   := REAL_TO_INT(ConsigneNiveau);

END_PROGRAM


CONFIGURATION Config0

  RESOURCE Res0 ON PLC
    TASK TaskMain(INTERVAL := T#100ms,PRIORITY := 1);
    PROGRAM P0 WITH TaskMain : CuveRegulationAvancee;
  END_RESOURCE

END_CONFIGURATION
