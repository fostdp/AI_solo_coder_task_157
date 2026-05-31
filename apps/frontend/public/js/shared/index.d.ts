export interface Section {
    name: string;
    x: number;
    A: number;
    M: number;
    P: number;
    T: number;
    V: number;
}

export interface ModelState {
    sections: Section[];
    shockLocation: number | null;
    entrainmentCoefficient: number;
    outletPressure: number;
    choked: boolean;
    massFlowPrimary: number;
    massFlowSecondary: number;
    massFlowTotal: number;
    maxAllowableFlow: number;
    pressureDistribution: Array<{ x: number; P: number }>;
    machDistribution: Array<{ x: number; M: number }>;
}

export interface ModelConfig {
    gamma: number;
    R: number;
    T0: number;
    Ps: number;
    dampingCoeff: number;
    maxIterations: number;
    convergenceTol: number;
    nozzleAreaRatio: number;
    mixingAreaRatio: number;
    diffuserAreaRatio: number;
}

export declare class OneDimensionalEjectorModel {
    constructor(config?: Partial<ModelConfig>);
    setOperatingConditions(workingPressure: number, entrainmentRatio: number, suctionPressure: number): void;
    solve(): ModelState;
    toJSON(): ModelState & { modelConfig: ModelConfig };
}
