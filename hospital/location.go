package hospital

import "fmt"

type Location int

const (
	LocationUnknown Location = iota

	LocationMainEntrance
	LocationEmergencyEntrance
	LocationReception
	LocationLobby
	LocationWaitingRoom

	LocationMainHallway
	LocationNorthHallway
	LocationSouthHallway
	LocationEastHallway
	LocationWestHallway
	LocationICUHallway
	LocationSurgicalHallway
	LocationPediatricsHallway

	LocationNorthWing
	LocationSouthWing
	LocationEastWing
	LocationWestWing
	LocationCentralTower

	LocationBasement
	LocationGroundFloor
	LocationFirstFloor
	LocationSecondFloor
	LocationThirdFloor
	LocationRoofHelipad

	LocationOperatingRoomBlock
	LocationRecoveryUnit
	LocationICUArea
	LocationNICUArea
	LocationEmergencyWard

	LocationRadiologyDepartment
	LocationLaboratoryZone
	LocationBloodBank
	LocationPharmacy

	LocationCafeteria
	LocationAdministrativeBlock
	LocationMaintenanceArea
	LocationSterilizationUnit
	LocationMortuary
)

func (l Location) String() string {
	names := [...]string{
		"Unknown",
		"Main Entrance",
		"Emergency Entrance",
		"Reception",
		"Lobby",
		"Waiting Room",
		"Main Hallway",
		"North Hallway",
		"South Hallway",
		"East Hallway",
		"West Hallway",
		"ICU Hallway",
		"Surgical Hallway",
		"Pediatrics Hallway",
		"North Wing",
		"South Wing",
		"East Wing",
		"West Wing",
		"Central Tower",
		"Basement",
		"Ground Floor",
		"First Floor",
		"Second Floor",
		"Third Floor",
		"Roof Helipad",
		"Operating Room Block",
		"Recovery Unit",
		"ICU Area",
		"NICU Area",
		"Emergency Ward",
		"Radiology Department",
		"Laboratory Zone",
		"Blood Bank",
		"Pharmacy",
		"Cafeteria",
		"Administrative Block",
		"Maintenance Area",
		"Sterilization Unit",
		"Mortuary",
	}

	if l < LocationUnknown || int(l) >= len(names) {
		return fmt.Sprintf("Location(%d)", l)
	}

	return names[l]
}

func (l Location) IsValid() bool {
	return l > LocationUnknown && l <= LocationMortuary
}
